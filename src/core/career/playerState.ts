import type { GameData, StatId } from '../data/types';

export const SAVE_VERSION = 3;

/** その日のデイリーミッション（端末の暦の date で作り直す） */
export interface MissionState {
  date: string;
  ids: string[];
  progress: Record<string, number>;
  claimed: string[];
  allClaimed: boolean;
}

/** お客さん図鑑の 1 行（お客の種類ごと） */
export interface BookEntry {
  visits: number;
  totalSales: number;
  bestSales: number;
}

/** 期間つきの自分磨き（エステ・整形）の効き目。効果の中身は self_care.json から引く */
export interface ActiveEffect {
  itemId: string;
  /** この通算日の朝に切れる */
  expiresDay: number;
}

/** セーブされる主人公の状態。すべて JSON にそのまま書ける値だけで持つ */
export interface PlayerState {
  version: number;
  genjiName: string;
  level: number;
  exp: number;
  money: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  /** 酔い度 0〜100 */
  drunk: number;
  beauty: number;
  intellect: number;
  sense: number;
  /** 趣味 id -> 履修レベル */
  hobbies: Record<string, number>;
  homeId: string;
  /** 0 始まりの通算日。暦は calendar.ts が引く */
  day: number;
  /** 集客パートのステージ。ゴールに着くたびに 1 上がる */
  stageLevel: number;
  /** 今日まだ使える自分磨きの回数 */
  actionsLeft: number;
  /** 今日まだ使える「広告を見て MP 全回復」の回数 */
  adRefillsLeft: number;
  /** 今日すでに出勤したか（1 日 1 回） */
  workedToday: boolean;
  /** 家賃を払えずに借金のまま越した月の数（連続） */
  debtMonths: number;
  totalSales: number;
  /** 乱数の種。出勤のたびに進める */
  seed: number;
  gameOver: boolean;
  /** 期間つきの効き目（エステ・整形） */
  effects: ActiveEffect[];
  /** 契約中の月額（ジム）の self_care id */
  subscriptions: string[];
  /** 倒したライバルの id */
  defeatedRivals: string[];
  /** 実時間の回復を最後に進めた時刻（ms）。0 はまだ */
  lastRealtimeMs: number;
  /** ログインボーナスを最後に受け取った日（"YYYY-MM-DD"、端末の暦）。空はまだ */
  lastLoginDate: string;
  loginStreak: number;
  missions: MissionState;
  /** お客の種類 id → 図鑑の記録。無ければ未接客（？？？） */
  book: Record<string, BookEntry>;
  /** 今月（ゲームの暦）の店での売上 */
  monthSales: number;
  /** 店内ランキングの NPC キャストの今月の売上 */
  npcSales: Record<string, number>;
}

export function createPlayer(data: GameData, genjiName: string, seed: number): PlayerState {
  const init = data.player.initial;
  return {
    version: SAVE_VERSION,
    genjiName,
    level: init.level,
    exp: 0,
    money: init.money,
    hp: init.max_hp,
    maxHp: init.max_hp,
    mp: init.max_mp,
    maxMp: init.max_mp,
    drunk: 0,
    beauty: init.beauty,
    intellect: init.intellect,
    sense: init.sense,
    hobbies: {},
    homeId: init.home_id,
    day: 0,
    stageLevel: init.stage_level,
    actionsLeft: data.player.actions_per_day,
    adRefillsLeft: data.player.ad_refills_per_day,
    workedToday: false,
    debtMonths: 0,
    totalSales: 0,
    seed: seed >>> 0,
    gameOver: false,
    effects: [],
    subscriptions: [],
    defeatedRivals: [],
    lastRealtimeMs: 0,
    lastLoginDate: '',
    loginStreak: 0,
    ...V3_DEFAULTS(),
  };
}

const V3_DEFAULTS = () => ({
  missions: { date: '', ids: [], progress: {}, claimed: [], allClaimed: false } as MissionState,
  book: {} as Record<string, BookEntry>,
  monthSales: 0,
  npcSales: {} as Record<string, number>,
});

export function statOf(state: PlayerState, stat: StatId): number {
  return state[stat];
}

export function hobbyLevel(state: PlayerState, hobbyId: string): number {
  return state.hobbies[hobbyId] ?? 0;
}

/** 版 1（v0.1）のセーブに、版 2 で増えた項目を足す */
function migrateV1(v1: Partial<PlayerState>): Partial<PlayerState> {
  return {
    ...v1,
    version: 2,
    effects: [],
    subscriptions: [],
    defeatedRivals: [],
    lastRealtimeMs: 0,
    lastLoginDate: '',
    loginStreak: 0,
  };
}

/** 版 2 のセーブに、版 3 で増えた項目（ミッション・図鑑・店内ランキング）を足す */
function migrateV2(v2: Partial<PlayerState>): Partial<PlayerState> {
  return { ...v2, version: 3, ...V3_DEFAULTS() };
}

/** 読み込んだセーブを今の形にする。壊れている・知らない版なら null（呼び側で新規作成へ） */
export function deserializePlayer(json: string): PlayerState | null {
  try {
    let parsed = JSON.parse(json) as Partial<PlayerState>;
    if (parsed.version === 1) parsed = migrateV1(parsed);
    if (parsed.version === 2) parsed = migrateV2(parsed);
    if (parsed.version !== SAVE_VERSION) return null;
    if (typeof parsed.genjiName !== 'string' || typeof parsed.level !== 'number') return null;
    return parsed as PlayerState;
  } catch {
    return null;
  }
}

export function serializePlayer(state: PlayerState): string {
  return JSON.stringify(state);
}

/** 出勤ごとに新しい種を払い出す（同じ日にやり直しても同じ展開にならないように） */
export function nextSeed(state: PlayerState): number {
  state.seed = (Math.imul(state.seed ^ 0x9e3779b9, 0x85ebca6b) + 0x632be5ab) >>> 0;
  return state.seed;
}
