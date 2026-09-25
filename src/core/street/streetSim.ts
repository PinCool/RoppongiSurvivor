import type { CustomerData, EnemyData, GameData, RivalData, SkillData, SkillKind, StreetData } from '../data/types';
import { Rng } from '../rng';
import { circlesOverlap, clamp, clampLength1, distance, distanceSq, normalize, type Vec2 } from '../vec';
import { blockedAt, generateCity, resolveCircle, type City } from './city';
import { NavGrid } from './nav';

/**
 * 集客パート（ヴァンサバ風）のシミュレーション。固定タイムステップで進み、描画は一切しない。
 *
 * 流れ: 雑魚を自動攻撃で蹴散らして経験値の粒を拾う → 決まった時刻にお客さん候補が現れる →
 * 近づくと一時停止して 3 択（同伴 / 経験値 / 回復）→ ゴール（お店）に着けば出勤成功。
 * 制限時間を過ぎれば遅刻、HP が尽きれば途中帰宅。
 * 関門のステージではライバル（キャバ嬢）も街に出て、近くのお客を横取りしに走る。
 * 街には建物（通れない壁）があり、敵とライバルは回り込みの経路（NavGrid）で向かってくる。
 */

export const FIXED_DT = 1 / 60;
const MAX_TICKS_PER_UPDATE = 8;
/** ライバルが最初に立つ、プレイヤーからの距離 */
const RIVAL_START_DISTANCE = 320;
/** 敵・お客の当たりの目安の半径（湧く場所・お店の場所が建物に掛からないかの判定） */
const AGENT_RADIUS = 20;
/**
 * 経路のマスを「歩ける」とみなす余白 = 自機の半径（いちばん大きい。敵はこれより小さい）。
 * 街の側で「隙間はくっつくか min_alley 以上」を守るので、ある路地は必ず自機が通れて、必ずマスにも映る。
 * （2026-09-25 に 2 度踏んだ: 余白 20 では自機だけ通れる路地が安全地帯に、余白 4 では誰も通れない隙間へ経路が引かれた）
 */
const NAV_CLEARANCE = 22;

export interface StreetInput {
  /** スティックの向き。長さ 1 を超える分は切る */
  move: Vec2;
}

export interface StreetParams {
  stageLevel: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  seed: number;
  /** 関門のステージならライバル */
  rival?: RivalData | null;
}

export interface RivalBody {
  id: string;
  visualId: string;
  pos: Vec2;
  facing: Vec2;
  moving: boolean;
  /** 横取りしたお客の数 */
  steals: number;
}

export interface PlayerBody {
  pos: Vec2;
  radius: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  invincible: number;
  /** 最後に動いた向き（描画の向き用）。止まっても保つ */
  facing: Vec2;
  moving: boolean;
}

export interface EnemyInstance {
  uid: number;
  typeId: string;
  visualId: string;
  pos: Vec2;
  hp: number;
  maxHp: number;
  radius: number;
  speed: number;
  damage: number;
  exp: number;
}

export interface Projectile {
  uid: number;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  damage: number;
  life: number;
  /** あと何体すり抜けられるか（スキル「貫通」） */
  pierce: number;
  /** もう当たった敵（貫通中に同じ敵へ 2 度当てない） */
  hitIds: number[];
}

export interface Gem {
  uid: number;
  pos: Vec2;
  value: number;
  magnet: boolean;
}

export type CustomerState = 'wandering' | 'recruited' | 'dismissed' | 'stolen';

export interface CustomerInstance {
  uid: number;
  typeId: string;
  visualId: string;
  pos: Vec2;
  /** 財布の中身（内部値。プレイヤーには見せない） */
  wallet: number;
  state: CustomerState;
  skipCooldown: number;
  wanderDir: Vec2;
  wanderTimer: number;
}

export interface Companion {
  typeId: string;
  wallet: number;
}

export type RecruitChoice = 'companion' | 'exp' | 'heal' | 'skip';

export type ChoiceBlock = 'mp' | 'full' | null;

export interface ChoiceOption {
  choice: Exclude<RecruitChoice, 'skip'>;
  mpCost: number;
  block: ChoiceBlock;
}

export type StreetEvent =
  | { type: 'shot'; pos: Vec2; dir: Vec2 }
  | { type: 'enemy_hit'; uid: number; pos: Vec2; damage: number }
  | { type: 'enemy_killed'; uid: number; pos: Vec2 }
  | { type: 'player_hurt'; damage: number }
  | { type: 'gem_collected'; value: number }
  | { type: 'street_level_up'; level: number }
  | { type: 'customer_spawned'; uid: number }
  | { type: 'goal_appeared'; pos: Vec2 }
  | { type: 'encounter'; uid: number }
  | { type: 'recruited'; uid: number; choice: RecruitChoice }
  | { type: 'customer_stolen'; uid: number; pos: Vec2 }
  | { type: 'skill_offer'; options: string[] }
  | { type: 'skill_chosen'; id: string; level: number };

export type OutcomeKind = 'goal' | 'late' | 'down';

export interface StreetOutcome {
  kind: OutcomeKind;
  companions: Companion[];
  streetExp: number;
  kills: number;
  hp: number;
  mp: number;
  time: number;
}

export class StreetSim {
  readonly player: PlayerBody;
  readonly enemies: EnemyInstance[] = [];
  readonly projectiles: Projectile[] = [];
  readonly gems: Gem[] = [];
  readonly customers: CustomerInstance[] = [];
  readonly companions: Companion[] = [];
  readonly rival: RivalBody | null;
  readonly city: City;
  /** 取ったスキル（スキル id → レベル） */
  readonly skills: Record<string, number> = {};

  private readonly _cfg: StreetData;
  private readonly _data: GameData;
  private readonly _rng: Rng;
  private readonly _stage: number;
  private readonly _customerPool: CustomerData[];
  private readonly _rivalData: RivalData | null;
  private readonly _nav: NavGrid;
  /** 開始地点からの道のり。-1 のマスは閉じた中庭などで、誰も入れないので何も置かない */
  private readonly _reach: Int32Array;
  /**
   * 目的地のマス → 流れ場（自機へ・ライバルの狙い・ボットの行き先で使い回す）。
   * 街は変わらないので、同じマスへの流れ場はずっと使える。最近使った 32 個だけ持つ
   */
  private readonly _fields = new Map<number, Int32Array>();
  private _events: StreetEvent[] = [];
  private _time = 0;
  private _accumulator = 0;
  private _nextUid = 1;
  private _spawnTimer = 0;
  private _weaponTimer = 0;
  private _nextCustomerIndex = 0;
  private _goal: Vec2 | null = null;
  private _pendingEncounter: number | null = null;
  private _outcome: StreetOutcome | null = null;
  private _streetExp = 0;
  private _streetLevel = 1;
  private _kills = 0;
  private _pendingLevelUps = 0;
  private _skillOffer: SkillData[] | null = null;
  private _orbitAngle = 0;
  /** ハートオービットが同じ敵に当たる間隔の管理（敵 uid → 次に当たれる時刻） */
  private readonly _orbitNextHit = new Map<number, number>();

  constructor(data: GameData, params: StreetParams) {
    this._data = data;
    this._cfg = data.street;
    this._rng = new Rng(params.seed);
    this._stage = Math.max(1, params.stageLevel);
    this.city = generateCity(this._cfg, data.buildings, params.seed);
    this._nav = new NavGrid(this.city, this._cfg.city.nav_cell, NAV_CLEARANCE);
    this._reach = this._nav.flowTo({ x: 0, y: 0 });
    this._customerPool = data.customers.filter((c) => c.min_stage <= this._stage && c.weight > 0);
    if (this._customerPool.length === 0) throw new Error(`ステージ ${this._stage} で出るお客が居ない`);
    this.player = {
      pos: { x: 0, y: 0 },
      radius: this._cfg.player.radius,
      hp: params.hp,
      maxHp: params.maxHp,
      mp: params.mp,
      maxMp: params.maxMp,
      invincible: 0,
      facing: { x: 1, y: 0 },
      moving: false,
    };
    this._spawnTimer = this._cfg.spawn.start_interval_seconds;
    this._rivalData = params.rival ?? null;
    this.rival = this._rivalData
      ? {
          id: this._rivalData.id,
          visualId: this._rivalData.visual_id,
          pos: this.pointAround(RIVAL_START_DISTANCE, 80),
          facing: { x: -1, y: 0 },
          moving: false,
          steals: 0,
        }
      : null;
  }

  get time(): number {
    return this._time;
  }

  get timeLeft(): number {
    return Math.max(0, this._cfg.duration_seconds - this._time);
  }

  get goal(): Readonly<Vec2> | null {
    return this._goal;
  }

  get pendingEncounter(): CustomerInstance | null {
    if (this._pendingEncounter === null) return null;
    return this.customers.find((c) => c.uid === this._pendingEncounter) ?? null;
  }

  get outcome(): StreetOutcome | null {
    return this._outcome;
  }

  get streetExp(): number {
    return this._streetExp;
  }

  get streetLevel(): number {
    return this._streetLevel;
  }

  get kills(): number {
    return this._kills;
  }

  /** 次のレベルまでの経験値（上限なら null） */
  get nextStreetLevelExp(): number | null {
    return this._cfg.street_level.exp_thresholds[this._streetLevel - 1] ?? null;
  }

  get paused(): boolean {
    return this._pendingEncounter !== null || this._outcome !== null || this._skillOffer !== null;
  }

  /** レベルアップで出ているスキルの 3 択（無ければ null）。選ぶまで時間は止まる */
  get skillOffer(): readonly SkillData[] | null {
    return this._skillOffer;
  }

  /** スキルを選ぶ。出ている選択肢でなければ false。溜まったレベルアップがあれば続けて次の 3 択を出す */
  chooseSkill(id: string): boolean {
    const skill = this._skillOffer?.find((k) => k.id === id);
    if (!skill) return false;
    const level = (this.skills[id] ?? 0) + 1;
    this.skills[id] = level;
    if (skill.kind === 'max_hp') {
      this.player.maxHp += skill.value;
      this.player.hp += skill.value;
    } else if (skill.kind === 'heal') {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + Math.round(this.player.maxHp * skill.value));
    }
    this._events.push({ type: 'skill_chosen', id, level });
    this._skillOffer = null;
    this._pendingLevelUps = Math.max(0, this._pendingLevelUps - 1);
    if (this._pendingLevelUps > 0) this.offerSkills();
    return true;
  }

  /** ハートオービットのハートの位置（描画用。無ければ空） */
  orbitPositions(): Vec2[] {
    const n = this.skillAmount('orbit');
    const o = this._cfg.orbit;
    return Array.from({ length: n }, (_, k) => {
      const a = this._orbitAngle + (k / n) * Math.PI * 2;
      return { x: this.player.pos.x + Math.cos(a) * o.radius, y: this.player.pos.y + Math.sin(a) * o.radius };
    });
  }

  /** その種類のスキルの合計（レベル × value）。orbit ならハートの数、power なら攻撃力の上乗せ割合 */
  skillAmount(kind: SkillKind): number {
    let sum = 0;
    for (const k of this._data.skills.skills) if (k.kind === kind) sum += (this.skills[k.id] ?? 0) * k.value;
    return sum;
  }

  private skillLevel(kind: SkillKind): number {
    let sum = 0;
    for (const k of this._data.skills.skills) if (k.kind === kind) sum += this.skills[k.id] ?? 0;
    return sum;
  }

  /** 取れるスキル（上限に達していない・回復は減っているときだけ）から重みで choices 個 */
  private offerSkills(): void {
    const pool = this._data.skills.skills.filter(
      (k) => (this.skills[k.id] ?? 0) < k.max_level && (k.kind !== 'heal' || this.player.hp < this.player.maxHp),
    );
    const options: SkillData[] = [];
    while (options.length < this._data.skills.choices && pool.length > 0) {
      const pick = this._rng.weighted(pool, (k) => k.weight);
      options.push(pick);
      pool.splice(pool.indexOf(pick), 1);
    }
    if (options.length === 0) {
      this._pendingLevelUps = 0;
      return;
    }
    this._skillOffer = options;
    this._events.push({ type: 'skill_offer', options: options.map((k) => k.id) });
  }

  /** 前回から溜まったイベントを取り出す（描画側の演出用） */
  drainEvents(): StreetEvent[] {
    const events = this._events;
    this._events = [];
    return events;
  }

  /** 実時間 dt を受け取り、固定ステップで進める。一時停止中は時間を捨てる */
  update(dt: number, input: StreetInput): void {
    if (this.paused) {
      this._accumulator = 0;
      return;
    }
    this._accumulator += Math.min(dt, FIXED_DT * MAX_TICKS_PER_UPDATE);
    while (this._accumulator >= FIXED_DT && !this.paused) {
      this._accumulator -= FIXED_DT;
      this.tick(input);
    }
  }

  /** 1 固定ステップ進める（テストから直接呼ぶ） */
  tick(input: StreetInput): void {
    if (this.paused) return;
    const dt = FIXED_DT;
    this._time += dt;

    this.spawnScheduledCustomers();
    this.revealGoalIfDue();
    this.movePlayer(input, dt);
    this.spawnEnemies(dt);
    this.moveEnemies(dt);
    this.fireWeapon(dt);
    this.moveProjectiles(dt);
    this.applyContactDamage(dt);
    if (this._outcome) return;
    this.updateGems(dt);
    if (this._skillOffer) return; // レベルアップの 3 択が出たら、この先（お客との遭遇など）は選んでから
    this.updateOrbit(dt);
    this.updateCustomers(dt);
    if (this._pendingEncounter !== null) return;
    this.moveRival(dt);

    if (this._goal && circlesOverlap(this.player.pos, this.player.radius, this._goal, this._cfg.goal_radius)) {
      this.finish('goal');
      return;
    }
    if (this._time >= this._cfg.duration_seconds) this.finish('late');
  }

  /** 遭遇中のお客に出せる選択肢と、選べない理由 */
  choiceOptions(): ChoiceOption[] {
    const customer = this.pendingEncounter;
    if (!customer) return [];
    const type = this.customerType(customer.typeId);
    const mp = this.player.mp;
    const companionCost = type.companion_mp_cost;
    const recruit = this._data.recruit;
    return [
      {
        choice: 'companion',
        mpCost: companionCost,
        block: this.companions.length >= this._cfg.max_companions ? 'full' : mp < companionCost ? 'mp' : null,
      },
      { choice: 'exp', mpCost: recruit.exp.mp_cost, block: mp < recruit.exp.mp_cost ? 'mp' : null },
      { choice: 'heal', mpCost: recruit.heal.mp_cost, block: mp < recruit.heal.mp_cost ? 'mp' : null },
    ];
  }

  /** 遭遇の 3 択を確定する。選べない選択肢なら false を返して何もしない */
  resolveEncounter(choice: RecruitChoice): boolean {
    const customer = this.pendingEncounter;
    if (!customer) return false;
    if (choice === 'skip') {
      customer.skipCooldown = this._cfg.customer_skip_cooldown_seconds;
      this._pendingEncounter = null;
      this._events.push({ type: 'recruited', uid: customer.uid, choice });
      return true;
    }
    const option = this.choiceOptions().find((o) => o.choice === choice);
    if (!option || option.block) return false;

    this.player.mp -= option.mpCost;
    if (choice === 'companion') {
      customer.state = 'recruited';
      this.companions.push({ typeId: customer.typeId, wallet: customer.wallet });
    } else if (choice === 'exp') {
      customer.state = 'dismissed';
      this.addStreetExp(this._data.recruit.exp.street_exp);
    } else {
      customer.state = 'dismissed';
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + this._data.recruit.heal.hp);
    }
    this._pendingEncounter = null;
    this._events.push({ type: 'recruited', uid: customer.uid, choice });
    return true;
  }

  /** MP を満タンにする（課金 / 広告の受け口。回数の管理は呼び側） */
  refillMp(): void {
    this.player.mp = this.player.maxMp;
  }

  private customerType(id: string): CustomerData {
    const type = this._data.customers.find((c) => c.id === id);
    if (!type) throw new Error(`お客の種類が無い: ${id}`);
    return type;
  }

  private newUid(): number {
    return this._nextUid++;
  }

  private clampToWorld(pos: Vec2, margin = 0): void {
    const half = this._cfg.world_half_size - margin;
    pos.x = clamp(pos.x, -half, half);
    pos.y = clamp(pos.y, -half, half);
  }

  /** プレイヤーから distance 離れた、建物に掛からない点。ワールドの外に出るなら内側へ押し戻す */
  private pointAround(distanceFromPlayer: number, margin: number, clearance = AGENT_RADIUS): Vec2 {
    let pos = { x: 0, y: 0 };
    for (let attempt = 0; attempt < 24; attempt++) {
      const angle = this._rng.range(0, Math.PI * 2);
      pos = {
        x: this.player.pos.x + Math.cos(angle) * distanceFromPlayer,
        y: this.player.pos.y + Math.sin(angle) * distanceFromPlayer,
      };
      this.clampToWorld(pos, margin);
      if (!blockedAt(this.city, pos, clearance) && this.reachable(pos)) return pos;
    }
    return this.snapToRoad(pos);
  }

  /** 開始地点から歩いて行ける場所か（閉じた中庭に湧かせない・置かない） */
  private reachable(pos: Vec2): boolean {
    const [i, j] = this._nav.cellOf(pos);
    return this._reach[j * this._nav.size + i]! >= 0;
  }

  /** いちばん近い道の芯線へ寄せる（建物を避けた点が見つからなかったとき） */
  private snapToRoad(pos: Vec2): Vec2 {
    const pitch = this.city.pitch;
    const rx = Math.round(pos.x / pitch) * pitch;
    const ry = Math.round(pos.y / pitch) * pitch;
    return Math.abs(pos.x - rx) < Math.abs(pos.y - ry) ? { x: rx, y: pos.y } : { x: pos.x, y: ry };
  }

  /**
   * 画面の外の楕円の上の点（敵の湧き）。斜め見下ろしでは地面の同じ距離でも縦と横で画面の距離が違うので、
   * 画面の座標で楕円を取ってから地面へ戻す。
   */
  private pointOffscreen(radius: number): Vec2 {
    const v = this._cfg.view;
    let pos = { x: 0, y: 0 };
    for (let attempt = 0; attempt < 16; attempt++) {
      const angle = this._rng.range(0, Math.PI * 2);
      const sx = Math.cos(angle) * v.spawn_screen_half_w;
      const sy = Math.sin(angle) * v.spawn_screen_half_h;
      pos = {
        x: this.player.pos.x + (sx / v.iso_x + sy / v.iso_y) / 2,
        y: this.player.pos.y + (sy / v.iso_y - sx / v.iso_x) / 2,
      };
      this.clampToWorld(pos, radius);
      if (!blockedAt(this.city, pos, radius) && this.reachable(pos)) return pos;
    }
    return this.snapToRoad(pos);
  }

  /**
   * from から to へ向かう向き（建物を回り込む）。流れ場は目的地のマスごとに作って使い回す。
   * 近いときはまっすぐ。ボットや描画側からも呼べる
   */
  navigate(from: Vec2, to: Vec2): Vec2 {
    return this.navigateWith(this.fieldFor(to), from, to);
  }

  private navigateWith(field: Int32Array, from: Vec2, to: Vec2): Vec2 {
    const direct = normalize({ x: to.x - from.x, y: to.y - from.y });
    if (distanceSq(from, to) < (this._cfg.city.nav_cell * 1.5) ** 2) return direct;
    return this._nav.direction(field, from) ?? direct;
  }

  private fieldFor(to: Vec2): Int32Array {
    const [i, j] = this._nav.cellOf(to);
    const key = j * this._nav.size + i;
    let field = this._fields.get(key);
    if (field) {
      // 最近使った順に並べ直す（Map は入れた順なので、消して入れ直す）
      this._fields.delete(key);
    } else {
      field = this._nav.flowTo(to);
      if (this._fields.size >= 32) this._fields.delete(this._fields.keys().next().value as number);
    }
    this._fields.set(key, field);
    return field;
  }

  private spawnScheduledCustomers(): void {
    const times = this._cfg.customer_spawn_seconds;
    while (this._nextCustomerIndex < times.length && this._time >= (times[this._nextCustomerIndex] as number)) {
      this._nextCustomerIndex++;
      const type = this._rng.weighted(this._customerPool, (c) => c.weight);
      const customer: CustomerInstance = {
        uid: this.newUid(),
        typeId: type.id,
        visualId: type.visual_id,
        pos: this.pointAround(this._cfg.customer_spawn_distance, 80),
        wallet: this._rng.int(type.wallet_min, type.wallet_max),
        state: 'wandering',
        skipCooldown: 0,
        wanderDir: { x: 0, y: 0 },
        wanderTimer: 0,
      };
      this.customers.push(customer);
      this._events.push({ type: 'customer_spawned', uid: customer.uid });
    }
  }

  private revealGoalIfDue(): void {
    if (this._goal || this._time < this._cfg.goal_appear_seconds) return;
    this._goal = this.pointAround(this._cfg.goal_distance, this._cfg.goal_radius + 40, this._cfg.goal_radius);
    this._events.push({ type: 'goal_appeared', pos: { ...this._goal } });
  }

  private movePlayer(input: StreetInput, dt: number): void {
    const move = clampLength1(input.move);
    const moving = move.x !== 0 || move.y !== 0;
    this.player.moving = moving;
    if (moving) {
      this.player.facing = normalize(move);
      const speed = this._cfg.player.move_speed * (1 + this.skillAmount('speed'));
      this.player.pos.x += move.x * speed * dt;
      this.player.pos.y += move.y * speed * dt;
      this.clampToWorld(this.player.pos, this.player.radius);
      resolveCircle(this.city, this.player.pos, this.player.radius);
    }
    if (this.player.invincible > 0) this.player.invincible = Math.max(0, this.player.invincible - dt);
  }

  private currentSpawnInterval(): number {
    const s = this._cfg.spawn;
    const minutes = this._time / 60;
    const base = Math.max(s.min_interval_seconds, s.start_interval_seconds - s.interval_decay_per_minute * minutes);
    return base / (1 + this._cfg.stage_scaling.spawn_rate_per_stage * (this._stage - 1));
  }

  private spawnEnemies(dt: number): void {
    this._spawnTimer -= dt;
    let guard = 0;
    while (this._spawnTimer <= 0 && guard++ < 16) {
      this._spawnTimer += this.currentSpawnInterval();
      if (this.enemies.length >= this._cfg.spawn.max_alive) continue;
      const pool = this._data.enemies.filter((e) => e.from_seconds <= this._time && e.weight > 0);
      if (pool.length === 0) continue;
      this.spawnEnemy(this._rng.weighted(pool, (e) => e.weight));
    }
  }

  private spawnEnemy(type: EnemyData): void {
    const hpScale = 1 + this._cfg.stage_scaling.enemy_hp_per_stage * (this._stage - 1);
    const hp = Math.round(type.max_hp * hpScale);
    this.enemies.push({
      uid: this.newUid(),
      typeId: type.id,
      visualId: type.visual_id,
      pos: this.pointOffscreen(type.radius),
      hp,
      maxHp: hp,
      radius: type.radius,
      speed: type.move_speed,
      damage: type.contact_damage,
      exp: type.exp,
    });
  }

  private moveEnemies(dt: number): void {
    if (this.enemies.length === 0) return;
    const target = this.player.pos;
    const field = this.fieldFor(target); // 全員が同じ流れ場を下る（1 ティックに 1 回だけ引く）
    for (const enemy of this.enemies) {
      const dir = this.navigateWith(field, enemy.pos, target);
      enemy.pos.x += dir.x * enemy.speed * dt;
      enemy.pos.y += dir.y * enemy.speed * dt;
      resolveCircle(this.city, enemy.pos, enemy.radius);
    }
  }

  /** 武器の今の性能（取ったスキルで決まる） */
  private weaponStats(): { damage: number; cooldown: number; count: number; pierce: number } {
    const w = this._cfg.weapon;
    const rapid = this._data.skills.skills.find((k) => k.kind === 'rapid');
    return {
      damage: Math.round(w.damage * (1 + this.skillAmount('power'))),
      cooldown: w.cooldown_seconds * Math.pow(rapid?.value ?? 1, this.skillLevel('rapid')),
      count: 1 + Math.round(this.skillAmount('multishot')),
      pierce: Math.round(this.skillAmount('pierce')),
    };
  }

  /**
   * いちばん近い敵へ撃つ。マルチショットは扇に広げ、ななめ撃ちは ±角度、バックショットは真後ろにも撃つ
   * （アーチャー伝説の矢の足し方）
   */
  private fireWeapon(dt: number): void {
    this._weaponTimer = Math.max(0, this._weaponTimer - dt);
    if (this._weaponTimer > 0) return;
    const w = this._cfg.weapon;
    const rangeSq = w.range * w.range;
    let nearest: EnemyInstance | null = null;
    let best = Infinity;
    for (const e of this.enemies) {
      const d = distanceSq(e.pos, this.player.pos);
      if (d <= rangeSq && d < best) {
        best = d;
        nearest = e;
      }
    }
    if (!nearest) return;

    const stats = this.weaponStats();
    const aim = Math.atan2(nearest.pos.y - this.player.pos.y, nearest.pos.x - this.player.pos.x);
    const rad = Math.PI / 180;
    const angles: number[] = [];
    for (let i = 0; i < stats.count; i++) angles.push(aim + (i - (stats.count - 1) / 2) * w.multishot_spread_deg * rad);
    const diagonal = this._data.skills.skills.find((k) => k.kind === 'diagonal');
    if (diagonal && this.skillLevel('diagonal') > 0) angles.push(aim + diagonal.value * rad, aim - diagonal.value * rad);
    if (this.skillLevel('rear') > 0) angles.push(aim + Math.PI);
    for (const a of angles) {
      const dir = { x: Math.cos(a), y: Math.sin(a) };
      this.projectiles.push({
        uid: this.newUid(),
        pos: { ...this.player.pos },
        vel: { x: dir.x * w.projectile_speed, y: dir.y * w.projectile_speed },
        radius: w.projectile_radius,
        damage: stats.damage,
        life: w.projectile_life_seconds,
        pierce: stats.pierce,
        hitIds: [],
      });
      this._events.push({ type: 'shot', pos: { ...this.player.pos }, dir });
    }
    this._weaponTimer = stats.cooldown;
  }

  private moveProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const shot = this.projectiles[i] as Projectile;
      shot.pos.x += shot.vel.x * dt;
      shot.pos.y += shot.vel.y * dt;
      shot.life -= dt;
      const hit = this.enemies.find((e) => !shot.hitIds.includes(e.uid) && circlesOverlap(shot.pos, shot.radius, e.pos, e.radius));
      let spent = false;
      if (hit) {
        shot.hitIds.push(hit.uid);
        this.damageEnemy(hit, shot.damage);
        if (shot.pierce > 0) shot.pierce--;
        else spent = true;
      }
      if (spent || shot.life <= 0 || blockedAt(this.city, shot.pos)) this.projectiles.splice(i, 1);
    }
  }

  private damageEnemy(enemy: EnemyInstance, damage: number): void {
    enemy.hp -= damage;
    this._events.push({ type: 'enemy_hit', uid: enemy.uid, pos: { ...enemy.pos }, damage });
    if (enemy.hp <= 0) this.killEnemy(enemy);
  }

  /** ハートオービット: 自機の周りを回り、触れた敵を hit_interval おきに削る */
  private updateOrbit(dt: number): void {
    const n = this.skillAmount('orbit');
    if (n <= 0) return;
    const o = this._cfg.orbit;
    this._orbitAngle += o.speed_deg * (Math.PI / 180) * dt;
    const orbs = this.orbitPositions();
    for (const enemy of [...this.enemies]) {
      if ((this._orbitNextHit.get(enemy.uid) ?? 0) > this._time) continue;
      if (!orbs.some((orb) => circlesOverlap(orb, o.orb_radius, enemy.pos, enemy.radius))) continue;
      this._orbitNextHit.set(enemy.uid, this._time + o.hit_interval);
      this.damageEnemy(enemy, Math.round(o.damage * (1 + this.skillAmount('power'))));
    }
  }

  private killEnemy(enemy: EnemyInstance): void {
    const index = this.enemies.indexOf(enemy);
    if (index >= 0) this.enemies.splice(index, 1);
    this._kills++;
    this.gems.push({ uid: this.newUid(), pos: { ...enemy.pos }, value: enemy.exp, magnet: false });
    this._events.push({ type: 'enemy_killed', uid: enemy.uid, pos: { ...enemy.pos } });
  }

  private applyContactDamage(dt: number): void {
    void dt;
    if (this.player.invincible > 0) return;
    const touching = this.enemies.find((e) => circlesOverlap(e.pos, e.radius, this.player.pos, this.player.radius));
    if (!touching) return;
    this.player.hp = Math.max(0, this.player.hp - touching.damage);
    this.player.invincible = this._cfg.player.invincible_seconds;
    this._events.push({ type: 'player_hurt', damage: touching.damage });
    if (this.player.hp <= 0) this.finish('down');
  }

  private updateGems(dt: number): void {
    const p = this._cfg.player;
    const magnet = p.magnet_radius * (1 + this.skillAmount('magnet'));
    const magnetSq = magnet * magnet;
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const gem = this.gems[i] as Gem;
      if (!gem.magnet && distanceSq(gem.pos, this.player.pos) <= magnetSq) gem.magnet = true;
      if (gem.magnet) {
        const dir = normalize({ x: this.player.pos.x - gem.pos.x, y: this.player.pos.y - gem.pos.y });
        const step = this._cfg.gem_magnet_speed * dt;
        const left = distance(gem.pos, this.player.pos);
        gem.pos.x += dir.x * Math.min(step, left);
        gem.pos.y += dir.y * Math.min(step, left);
      }
      if (distance(gem.pos, this.player.pos) <= p.pickup_radius) {
        this.gems.splice(i, 1);
        this._events.push({ type: 'gem_collected', value: gem.value });
        this.addStreetExp(gem.value);
      }
    }
  }

  private addStreetExp(amount: number): void {
    this._streetExp += amount;
    const thresholds = this._cfg.street_level.exp_thresholds;
    while (this._streetLevel - 1 < thresholds.length && this._streetExp >= (thresholds[this._streetLevel - 1] as number)) {
      this._streetLevel++;
      this._pendingLevelUps++;
      this._events.push({ type: 'street_level_up', level: this._streetLevel });
    }
    if (this._pendingLevelUps > 0 && !this._skillOffer) this.offerSkills();
  }

  private updateCustomers(dt: number): void {
    const talkSq = (this._cfg.customer_talk_radius + this.player.radius) ** 2;
    for (const customer of this.customers) {
      if (customer.state !== 'wandering') continue;
      customer.skipCooldown = Math.max(0, customer.skipCooldown - dt);
      customer.wanderTimer -= dt;
      if (customer.wanderTimer <= 0) {
        customer.wanderTimer = this._rng.range(1.5, 3);
        const angle = this._rng.range(0, Math.PI * 2);
        const idle = this._rng.chance(0.35);
        customer.wanderDir = idle ? { x: 0, y: 0 } : { x: Math.cos(angle), y: Math.sin(angle) };
      }
      customer.pos.x += customer.wanderDir.x * this._cfg.customer_wander_speed * dt;
      customer.pos.y += customer.wanderDir.y * this._cfg.customer_wander_speed * dt;
      this.clampToWorld(customer.pos, 80);
      if (resolveCircle(this.city, customer.pos, AGENT_RADIUS)) customer.wanderTimer = 0;
      if (this._pendingEncounter === null && customer.skipCooldown <= 0 && distanceSq(customer.pos, this.player.pos) <= talkSq) {
        this._pendingEncounter = customer.uid;
        this._events.push({ type: 'encounter', uid: customer.uid });
      }
    }
  }

  /**
   * ライバルはいちばん近い「まだ誰のものでもない」お客へ走り、触れたら横取りする。
   * 狙うお客がいなければプレイヤーの近くをうろつく（画面に居続けて存在感を出す）。
   */
  private moveRival(dt: number): void {
    const rival = this.rival;
    const data = this._rivalData;
    if (!rival || !data) return;
    let target: CustomerInstance | null = null;
    let best = Infinity;
    for (const c of this.customers) {
      if (c.state !== 'wandering') continue;
      const d = distanceSq(c.pos, rival.pos);
      if (d < best) {
        best = d;
        target = c;
      }
    }
    const goal = target ? target.pos : this.player.pos;
    const keepAway = target ? 0 : 180;
    const dx = goal.x - rival.pos.x;
    const dy = goal.y - rival.pos.y;
    const dist = Math.hypot(dx, dy);
    rival.moving = dist > keepAway + 4;
    if (rival.moving) {
      rival.facing = this.navigate(rival.pos, goal);
      const step = Math.min(data.move_speed * dt, dist - keepAway);
      rival.pos.x += rival.facing.x * step;
      rival.pos.y += rival.facing.y * step;
      this.clampToWorld(rival.pos, 40);
      resolveCircle(this.city, rival.pos, AGENT_RADIUS);
    }
    if (target && distance(target.pos, rival.pos) <= data.steal_radius) {
      target.state = 'stolen';
      rival.steals++;
      this._events.push({ type: 'customer_stolen', uid: target.uid, pos: { ...target.pos } });
    }
  }

  private finish(kind: OutcomeKind): void {
    this._outcome = {
      kind,
      companions: kind === 'down' ? [] : this.companions.map((c) => ({ ...c })),
      streetExp: this._streetExp,
      kills: this._kills,
      hp: this.player.hp,
      mp: this.player.mp,
      time: this._time,
    };
  }
}
