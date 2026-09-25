import type { CustomerData, DrinkData, GameData, StatId, Vibe } from '../data/types';
import { VIBES } from '../data/types';
import { Rng } from '../rng';
import type { Companion } from '../street/streetSim';

/**
 * 接客パート。集客で連れてきたお客を 1 人ずつ接客する。
 *
 * 1. お客が今日の心境を話す → ノリ（ガンガン / 楽しく / ゆっくり）を 3 択で返す。合えば成功率 +、外せば −
 * 2. ドリンクをおねだりする。MP を払って成功判定。お客は財布の上限を持ち、超える額は必ず断られる
 * 3. 失敗が patience 回に達するとお客は帰る。プレイヤーはいつでも次のお客へ進める
 */

export interface ServicePlayer {
  mp: number;
  beauty: number;
  intellect: number;
  sense: number;
  hobbies: Record<string, number>;
  /** お客の種類 → 常連 Lv（無ければ 0） */
  regulars?: Record<string, number>;
}

export type ServicePhase = 'vibe' | 'drink' | 'left' | 'done';

/** 成功率に効いている要素。UI は「〇〇ボーナス発生！」として見せる */
export type BonusTag =
  | { kind: 'vibe_match' }
  | { kind: 'vibe_miss' }
  | { kind: 'preference_match'; stat: StatId }
  | { kind: 'preference_miss'; stat: StatId }
  | { kind: 'hobby'; hobbyId: string }
  | { kind: 'regular'; level: number };

export interface ServiceGuest {
  typeId: string;
  visualId: string;
  mood: Vibe;
  /** お客のセリフのキー（i18n） */
  moodLineKey: string;
  wallet: number;
  patience: number;
  sales: number;
  vibe: Vibe | null;
}

export interface VibeResult {
  matched: boolean;
  reactionKey: string;
}

export type OrderFailReason = 'over_wallet' | 'declined';

export interface OrderResult {
  success: boolean;
  drinkId: string;
  price: number;
  mpCost: number;
  failReason: OrderFailReason | null;
  reactionKey: string;
  guestLeft: boolean;
}

export type DrinkBlock = 'mp' | null;

export interface DrinkOption {
  drink: DrinkData;
  block: DrinkBlock;
}

export interface ServiceResult {
  sales: number;
  mpLeft: number;
  drunkGained: number;
  guests: { typeId: string; sales: number; left: boolean }[];
  /** 入ったシャンパン系の数・ノリが合った数（デイリーミッション） */
  champagneOrders: number;
  vibeMatches: number;
}

export class ServiceSession {
  readonly guests: ServiceGuest[];
  private readonly _data: GameData;
  private readonly _player: ServicePlayer;
  private readonly _rng: Rng;
  private _index = 0;
  private _phase: ServicePhase;
  private _mp: number;
  private _drunkGained = 0;
  private _champagneOrders = 0;
  private _vibeMatches = 0;
  private readonly _leftEarly = new Set<number>();

  constructor(data: GameData, player: ServicePlayer, companions: readonly Companion[], seed: number) {
    this._data = data;
    this._player = player;
    this._mp = player.mp;
    this._rng = new Rng(seed);
    this.guests = companions.map((companion) => this.createGuest(companion));
    this._phase = this.guests.length > 0 ? 'vibe' : 'done';
  }

  get phase(): ServicePhase {
    return this._phase;
  }

  get mp(): number {
    return this._mp;
  }

  get guestIndex(): number {
    return this._index;
  }

  get current(): ServiceGuest | null {
    return this._phase === 'done' ? null : (this.guests[this._index] ?? null);
  }

  get totalSales(): number {
    return this.guests.reduce((sum, g) => sum + g.sales, 0);
  }

  /** ノリを返す。1 人につき 1 回だけ */
  chooseVibe(vibe: Vibe): VibeResult {
    const guest = this.requireGuest('vibe');
    guest.vibe = vibe;
    const matched = guest.mood === vibe;
    if (matched) this._vibeMatches++;
    this._phase = 'drink';
    return { matched, reactionKey: `service.reaction.${matched ? 'match' : 'miss'}.${guest.mood}` };
  }

  /** いま成功率に効いている要素 */
  bonusTags(): BonusTag[] {
    const guest = this.current;
    if (!guest || guest.vibe === null) return [];
    const type = this.customerType(guest.typeId);
    const tags: BonusTag[] = [guest.vibe === guest.mood ? { kind: 'vibe_match' } : { kind: 'vibe_miss' }];
    const stat = type.preference;
    tags.push(this._player[stat] >= type.preference_min ? { kind: 'preference_match', stat } : { kind: 'preference_miss', stat });
    if ((this._player.hobbies[type.hobby] ?? 0) >= type.hobby_level) tags.push({ kind: 'hobby', hobbyId: type.hobby });
    const level = this._player.regulars?.[guest.typeId] ?? 0;
    if (level > 0) tags.push({ kind: 'regular', level });
    return tags;
  }

  /** ドリンクの成功率（財布の上限は含まない。上限超えは別に必ず断られる） */
  successChance(drink: DrinkData): number {
    const s = this._data.service;
    let chance = drink.base_success;
    for (const tag of this.bonusTags()) {
      switch (tag.kind) {
        case 'vibe_match':
          chance += s.vibe_match_bonus;
          break;
        case 'vibe_miss':
          chance -= s.vibe_miss_penalty;
          break;
        case 'preference_match':
          chance += s.preference_bonus;
          break;
        case 'preference_miss':
          chance -= s.preference_penalty;
          break;
        case 'hobby':
          chance += s.hobby_bonus;
          break;
        case 'regular':
          chance += this._data.regulars.success_bonus_per_level * tag.level;
          break;
      }
    }
    return Math.min(s.max_success, Math.max(s.min_success, chance));
  }

  drinkOptions(): DrinkOption[] {
    return this._data.drinks.map((drink) => ({ drink, block: this._mp < drink.mp_cost ? 'mp' : null }));
  }

  /** ドリンクをおねだりする。MP は成否にかかわらず払う */
  order(drinkId: string): OrderResult {
    const guest = this.requireGuest('drink');
    const drink = this._data.drinks.find((d) => d.id === drinkId);
    if (!drink) throw new Error(`ドリンクが無い: ${drinkId}`);
    if (this._mp < drink.mp_cost) throw new Error(`MP が足りない: ${drinkId}`);
    this._mp -= drink.mp_cost;

    let failReason: OrderFailReason | null = null;
    if (drink.price > guest.wallet) failReason = 'over_wallet';
    else if (!this._rng.chance(this.successChance(drink))) failReason = 'declined';

    if (failReason === null) {
      guest.wallet -= drink.price;
      guest.sales += drink.price;
      this._drunkGained += drink.drunk;
      if (drink.champagne) this._champagneOrders++;
      return { success: true, drinkId, price: drink.price, mpCost: drink.mp_cost, failReason, reactionKey: this.lineKey('order_ok'), guestLeft: false };
    }

    guest.patience -= 1;
    const guestLeft = guest.patience <= 0;
    if (guestLeft) {
      this._phase = 'left';
      this._leftEarly.add(this._index);
    }
    const reactionKey = guestLeft
      ? this.lineKey('guest_left')
      : failReason === 'over_wallet'
        ? this.lineKey('over_wallet')
        : this.lineKey('declined');
    return { success: false, drinkId, price: drink.price, mpCost: drink.mp_cost, failReason, reactionKey, guestLeft };
  }

  /** 次のお客へ（ノリを選ぶ前でも、帰られた後でも進める） */
  nextGuest(): void {
    if (this._phase === 'done') return;
    this._index++;
    this._phase = this._index < this.guests.length ? 'vibe' : 'done';
  }

  result(): ServiceResult {
    return {
      sales: this.totalSales,
      mpLeft: this._mp,
      drunkGained: this._drunkGained,
      guests: this.guests.map((g, i) => ({ typeId: g.typeId, sales: g.sales, left: this._leftEarly.has(i) })),
      champagneOrders: this._champagneOrders,
      vibeMatches: this._vibeMatches,
    };
  }

  private createGuest(companion: Companion): ServiceGuest {
    const type = this.customerType(companion.typeId);
    const mood = this._rng.weighted(VIBES, (v) => type.mood_weights[v]);
    const line = this._rng.int(1, this._data.service.mood_lines_per_mood);
    return {
      typeId: type.id,
      visualId: type.visual_id,
      mood,
      moodLineKey: `service.mood.${mood}.${line}`,
      // 常連ほど財布の紐がゆるい
      wallet: Math.round(companion.wallet * (1 + this._data.regulars.wallet_bonus_per_level * (this._player.regulars?.[type.id] ?? 0))),
      patience: this._data.service.patience,
      sales: 0,
      vibe: null,
    };
  }

  private lineKey(kind: 'order_ok' | 'over_wallet' | 'declined' | 'guest_left'): string {
    return `service.line.${kind}.${this._rng.int(1, 2)}`;
  }

  private requireGuest(phase: ServicePhase): ServiceGuest {
    const guest = this.current;
    if (!guest || this._phase !== phase) throw new Error(`接客の段階が違う: いま ${this._phase}, 必要 ${phase}`);
    return guest;
  }

  private customerType(id: string): CustomerData {
    const type = this._data.customers.find((c) => c.id === id);
    if (!type) throw new Error(`お客の種類が無い: ${id}`);
    return type;
  }
}
