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
  };
  street_level: {
    exp_thresholds: number[];
    damage_per_level: number;
    cooldown_multiplier_per_level: number;
    extra_projectile_every_levels: number;
  };
  spawn: {
    start_interval_seconds: number;
    min_interval_seconds: number;
    interval_decay_per_minute: number;
    distance_min: number;
    distance_max: number;
    max_alive: number;
  };
  stage_scaling: { enemy_hp_per_stage: number; spawn_rate_per_stage: number };
  gem_magnet_speed: number;
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

export interface SelfCareData {
  id: string;
  name_key: string;
  category: StatId;
  cost: number;
  gains: Partial<Record<StatId, number>>;
  hobbies: Record<string, number>;
  min_level: number;
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
  homes: HomeData[];
  calendar: CalendarData;
  rank: RankData;
  ngWords: string[];
}
