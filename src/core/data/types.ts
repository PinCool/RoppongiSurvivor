/**
 * src/data/*.json と 1 対 1 の型。キーは JSON と同じ snake_case のまま持つ
 * （読み替えの層を挟まないので、JSON と型の食い違いは validate が 1 か所で見つける）。
 */

export type StatId = 'beauty' | 'intellect' | 'sense';
export const STAT_IDS: readonly StatId[] = ['beauty', 'intellect', 'sense'];

export type Vibe = 'wild' | 'fun' | 'calm';
export const VIBES: readonly Vibe[] = ['wild', 'fun', 'calm'];

export interface PlayerData {
  initial: {
    level: number;
    money: number;
    max_hp: number;
    max_mp: number;
    beauty: number;
    intellect: number;
    sense: number;
    home_id: string;
    stage_level: number;
  };
  level_curve: { base_exp: number; growth: number; max_level: number };
  level_up_gains: { max_hp: number; max_mp: number };
  overnight: {
    hp_recover_ratio: number;
    mp_recover_ratio: number;
    drunk_decay_ratio: number;
    hangover_threshold: number;
    hangover_recover_multiplier: number;
  };
  rest_day: { hp_recover_ratio: number; mp_recover_ratio: number };
  actions_per_day: number;
  back_rate: number;
  exp_per_street_exp: number;
  exp_per_1000_sales: number;
  late_sales_multiplier: number;
  genji_name_max_length: number;
  ad_refills_per_day: number;
  /** 実時間での回復（アプリを閉じていても進む）。elapsed は max_elapsed_minutes で頭打ち */
  realtime: { hp_per_minute: number; mp_per_minute: number; drunk_per_minute: number; max_elapsed_minutes: number };
}

export interface StreetData {
  duration_seconds: number;
  goal_appear_seconds: number;
  goal_distance: number;
  goal_radius: number;
  customer_spawn_seconds: number[];
  customer_spawn_distance: number;
  customer_talk_radius: number;
  customer_wander_speed: number;
  customer_skip_cooldown_seconds: number;
  max_companions: number;
  world_half_size: number;
  player: {
    move_speed: number;
    radius: number;
    magnet_radius: number;
    pickup_radius: number;
    invincible_seconds: number;
  };
  weapon: {
    cooldown_seconds: number;
    damage: number;
    projectile_speed: number;
    projectile_radius: number;
    range: number;
    projectile_life_seconds: number;
    /** マルチショットで扇に広げる 1 発ごとの角度 */
    multishot_spread_deg: number;
  };
  /** 粒を拾って上がる集客中のレベル。上がるたびにスキルを 3 択で選ぶ（skills.json） */
  street_level: {
    exp_thresholds: number[];
  };
  /** スキル「ハートオービット」: 自機の周りを回るハート */
  orbit: { radius: number; speed_deg: number; damage: number; orb_radius: number; hit_interval: number };
  spawn: {
    start_interval_seconds: number;
    min_interval_seconds: number;
    interval_decay_per_minute: number;
    max_alive: number;
  };
  stage_scaling: { enemy_hp_per_stage: number; spawn_rate_per_stage: number };
  gem_magnet_speed: number;
  /** 街の作り（city.ts）。道の格子の間隔・道の半幅・建物の大きさと並べ方 */
  city: {
    pitch: number;
    road_half_width: number;
    lot_size: number;
    lot_margin: number;
    lot_gap: number;
    empty_lot_chance: number;
    plaza_block_chance: number;
    /** 建物のある区画のうち、ランドマーク（大きい建物 1 棟）にする割合 */
    landmark_block_chance: number;
    /** 建物どうしの隙間は「くっつく」か「この幅以上の路地」のどちらか（中途半端な隙間は、誰も通れないのに通れそうに見える） */
    min_alley: number;
    spawn_clear_radius: number;
    nav_cell: number;
  };
  /**
   * 地面 → 画面の写し（斜め見下ろし）: 画面 x = (x − y) × iso_x、画面 y = (x + y) × iso_y。
   * 敵は画面の外の楕円（spawn_screen_half_w × _h）から湧く
   */
  view: { iso_x: number; iso_y: number; spawn_screen_half_w: number; spawn_screen_half_h: number };
}

export interface EnemyData {
  id: string;
  name_key: string;
  visual_id: string;
  max_hp: number;
  move_speed: number;
  radius: number;
  contact_damage: number;
  exp: number;
  from_seconds: number;
  weight: number;
}

export interface CustomerData {
  id: string;
  name_key: string;
  visual_id: string;
  rank: string;
  min_stage: number;
  weight: number;
  wallet_min: number;
  wallet_max: number;
  preference: StatId;
  preference_min: number;
  hobby: string;
  hobby_level: number;
  mood_weights: Record<Vibe, number>;
  companion_mp_cost: number;
}

export interface RecruitData {
  exp: { mp_cost: number; street_exp: number };
  heal: { mp_cost: number; hp: number };
}

export interface DrinkData {
  id: string;
  name_key: string;
  price: number;
  mp_cost: number;
  base_success: number;
  drunk: number;
  /** シャンパン系か（ミッション「シャンパンを入れてもらう」で数える） */
  champagne: boolean;
}

export interface ServiceData {
  mood_lines_per_mood: number;
  vibe_match_bonus: number;
  vibe_miss_penalty: number;
  preference_bonus: number;
  preference_penalty: number;
  hobby_bonus: number;
  min_success: number;
  max_success: number;
  patience: number;
}

export interface HobbyData {
  id: string;
  name_key: string;
}

/**
 * 自分磨きの種類
 * - instant: 一度やれば能力がずっと上がる（勉強・服）
 * - timed: duration_days の間だけ効く。切れると rebound の分、元より下がる（エステ・整形）。切れる前にやり直せば延長
 * - subscription: 月額契約。契約中は効き続け、月末に monthly_fee を家賃と一緒に払う（ジム）
 */
export type SelfCareKind = 'instant' | 'timed' | 'subscription';

export interface SelfCareData {
  id: string;
  name_key: string;
  category: StatId;
  kind: SelfCareKind;
  cost: number;
  gains: Partial<Record<StatId, number>>;
  hobbies: Record<string, number>;
  min_level: number;
  duration_days?: number;
  rebound?: number;
  monthly_fee?: number;
}

/**
 * 建物の種類。足元（width × depth、街の単位）は当たり判定で、絵は visual_id で引く（buildings.json）。
 * landmark は区画まるごと 1 棟の大きい建物、それ以外は区画の 2×2 の区割りに 1 棟ずつ
 */
export interface BuildingKindData {
  id: string;
  visual_id: string;
  width: number;
  depth: number;
  landmark: boolean;
}

/** ライバルのキャバ嬢。gate_stage のステージで、その日の売上が sales_target を越えないと先へ進めない */
export interface RivalData {
  id: string;
  name_key: string;
  visual_id: string;
  gate_stage: number;
  sales_target: number;
  /** 集客でお客を横取りしに行く速さと、横取りできる距離 */
  move_speed: number;
  steal_radius: number;
}

export type LoginRewardKind = 'money' | 'hp_full' | 'mp_full';

export interface LoginBonusData {
  /** 連続ログインの日数で回る報酬（最後まで行ったら先頭へ） */
  cycle: { kind: LoginRewardKind; amount: number }[];
}

export interface HomeData {
  id: string;
  name_key: string;
  rent: number;
  rank_score: number;
  pet_allowed: boolean;
}

export interface CalendarData {
  start_month: number;
  weeks_per_month: number;
  /** 0 = 月曜 … 6 = 日曜 */
  closed_weekday: number;
  debt_game_over_months: number;
}

export interface RankData {
  weights: {
    level: number;
    beauty: number;
    intellect: number;
    sense: number;
    max_hp: number;
    max_mp: number;
    hobby_level: number;
  };
  letters: { letter: string; min: number }[];
}

/**
 * 集客中のスキル（アーチャー伝説 2 のような軽い 3 択）。value の意味は kind ごと:
 * multishot 弾 +value / diagonal 斜め ±value 度にも撃つ / rear 後ろにも撃つ / power 攻撃力 +value 割 /
 * rapid 間隔 ×value / pierce 貫通 +value / speed 移動 +value 割 / max_hp 最大 HP +value（回復もする）/
 * heal 最大 HP の value 割を回復（何度でも。減っているときだけ出る）/ magnet 吸い寄せ +value 割 / orbit ハート +value 個
 */
export type SkillKind = 'multishot' | 'diagonal' | 'rear' | 'power' | 'rapid' | 'pierce' | 'speed' | 'max_hp' | 'heal' | 'magnet' | 'orbit';
export const SKILL_KINDS: readonly SkillKind[] = ['multishot', 'diagonal', 'rear', 'power', 'rapid', 'pierce', 'speed', 'max_hp', 'heal', 'magnet', 'orbit'];

export interface SkillData {
  id: string;
  kind: SkillKind;
  value: number;
  max_level: number;
  weight: number;
}

export interface SkillsData {
  choices: number;
  skills: SkillData[];
}

export type MissionKind = 'kills' | 'companions' | 'shift_sales' | 'goal_shifts' | 'champagne' | 'self_care' | 'vibe_match';
export type MissionRewardKind = 'money' | 'mp_full' | 'ad_refill';
export interface MissionReward {
  kind: MissionRewardKind;
  amount: number;
}

/** デイリーミッション。端末の暦で 1 日ごとに pool から daily_count 個 */
export interface MissionData {
  daily_count: number;
  pool: { id: string; kind: MissionKind; target: number; reward: MissionReward }[];
  complete_all_reward: MissionReward;
}

/** 常連。接客した回数が level_visits[n] に届くと常連 Lv n+1。レベルごとに成功率と財布が上がる */
export interface RegularsData {
  level_visits: number[];
  success_bonus_per_level: number;
  wallet_bonus_per_level: number;
}

/** 店内の月間売上ランキング（NPC のキャストと競う。サーバのランキングができるまでの端末内の版） */
export interface RankingData {
  npcs: { id: string; name_key: string; daily_min: number; daily_max: number }[];
  /** NPC の売上がステージごとに伸びる割合（主人公の成長に合わせて手強くなる） */
  growth_per_stage: number;
  rewards: { rank: number; money: number }[];
}

export interface GameData {
  player: PlayerData;
  street: StreetData;
  enemies: EnemyData[];
  customers: CustomerData[];
  recruit: RecruitData;
  drinks: DrinkData[];
  service: ServiceData;
  hobbies: HobbyData[];
  selfCare: SelfCareData[];
  rivals: RivalData[];
  loginBonus: LoginBonusData;
  buildings: BuildingKindData[];
  missions: MissionData;
  skills: SkillsData;
  regulars: RegularsData;
  ranking: RankingData;
  homes: HomeData[];
  calendar: CalendarData;
  rank: RankData;
  ngWords: string[];
}
