import type { GameData } from './types';
import { STAT_IDS, VIBES } from './types';
import { checkShape, type Shape } from './shape';

const N = 'number' as const;
const S = 'string' as const;
const B = 'boolean' as const;

const SHAPES: Record<keyof GameData, Shape> = {
  player: {
    initial: { level: N, money: N, max_hp: N, max_mp: N, beauty: N, intellect: N, sense: N, home_id: S, stage_level: N },
    level_curve: { base_exp: N, growth: N, max_level: N },
    level_up_gains: { max_hp: N, max_mp: N },
    overnight: { hp_recover_ratio: N, mp_recover_ratio: N, drunk_decay_ratio: N, hangover_threshold: N, hangover_recover_multiplier: N },
    rest_day: { hp_recover_ratio: N, mp_recover_ratio: N },
    actions_per_day: N,
    back_rate: N,
    exp_per_street_exp: N,
    exp_per_1000_sales: N,
    late_sales_multiplier: N,
    genji_name_max_length: N,
    ad_refills_per_day: N,
    realtime: { hp_per_minute: N, mp_per_minute: N, drunk_per_minute: N, max_elapsed_minutes: N },
  },
  street: {
    duration_seconds: N,
    goal_appear_seconds: N,
    goal_distance: N,
    goal_radius: N,
    customer_spawn_seconds: { array: N },
    customer_spawn_distance: N,
    customer_talk_radius: N,
    customer_wander_speed: N,
    customer_skip_cooldown_seconds: N,
    max_companions: N,
    world_half_size: N,
    player: { move_speed: N, radius: N, magnet_radius: N, pickup_radius: N, invincible_seconds: N },
    weapon: { cooldown_seconds: N, damage: N, projectile_speed: N, projectile_radius: N, range: N, projectile_life_seconds: N },
    street_level: { exp_thresholds: { array: N }, damage_per_level: N, cooldown_multiplier_per_level: N, extra_projectile_every_levels: N },
    spawn: { start_interval_seconds: N, min_interval_seconds: N, interval_decay_per_minute: N, max_alive: N },
    stage_scaling: { enemy_hp_per_stage: N, spawn_rate_per_stage: N },
    gem_magnet_speed: N,
    city: {
      pitch: N, road_half_width: N, lot_size: N, lot_margin: N, lot_gap: N,
      empty_lot_chance: N, plaza_block_chance: N, landmark_block_chance: N, min_alley: N, spawn_clear_radius: N, nav_cell: N, nav_refresh_seconds: N,
    },
    view: { iso_x: N, iso_y: N, spawn_screen_half_w: N, spawn_screen_half_h: N },
  },
  enemies: {
    array: {
      id: S, name_key: S, visual_id: S, max_hp: N, move_speed: N, radius: N, contact_damage: N, exp: N, from_seconds: N, weight: N,
    },
  },
  customers: {
    array: {
      id: S, name_key: S, visual_id: S, rank: S, min_stage: N, weight: N, wallet_min: N, wallet_max: N,
      preference: S, preference_min: N, hobby: S, hobby_level: N,
      mood_weights: { wild: N, fun: N, calm: N }, companion_mp_cost: N,
    },
  },
  recruit: { exp: { mp_cost: N, street_exp: N }, heal: { mp_cost: N, hp: N } },
  drinks: { array: { id: S, name_key: S, price: N, mp_cost: N, base_success: N, drunk: N } },
  service: {
    mood_lines_per_mood: N, vibe_match_bonus: N, vibe_miss_penalty: N, preference_bonus: N, preference_penalty: N,
    hobby_bonus: N, min_success: N, max_success: N, patience: N,
  },
  hobbies: { array: { id: S, name_key: S } },
  selfCare: {
    array: {
      id: S, name_key: S, category: S, kind: S, cost: N, gains: { record: N }, hobbies: { record: N }, min_level: N,
      duration_days: { optional: N }, rebound: { optional: N }, monthly_fee: { optional: N },
    },
  },
  rivals: {
    array: { id: S, name_key: S, visual_id: S, gate_stage: N, sales_target: N, move_speed: N, steal_radius: N },
  },
  loginBonus: { cycle: { array: { kind: S, amount: N } } },
  buildings: { array: { id: S, visual_id: S, width: N, depth: N, landmark: B } },
  homes: { array: { id: S, name_key: S, rent: N, rank_score: N, pet_allowed: B } },
  calendar: { start_month: N, weeks_per_month: N, closed_weekday: N, debt_game_over_months: N },
  rank: {
    weights: { level: N, beauty: N, intellect: N, sense: N, max_hp: N, max_mp: N, hobby_level: N },
    letters: { array: { letter: S, min: N } },
  },
  ngWords: { array: S },
};

export class GameDataError extends Error {
  constructor(readonly errors: string[]) {
    super(`ゲームデータが不正です:\n${errors.join('\n')}`);
  }
}

function uniqueIds(items: { id: string }[], label: string, errors: string[]): Set<string> {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) errors.push(`${label}: id 重複 "${item.id}"`);
    seen.add(item.id);
  }
  return seen;
}

function positive(value: number, path: string, errors: string[]): void {
  if (!(value > 0)) errors.push(`${path}: 0 より大きくない (${value})`);
}

function probability(value: number, path: string, errors: string[]): void {
  if (!(value >= 0 && value <= 1)) errors.push(`${path}: 0〜1 の外 (${value})`);
}

function ascending(values: number[], path: string, errors: string[]): void {
  for (let i = 1; i < values.length; i++) {
    if (!((values[i] as number) > (values[i - 1] as number))) errors.push(`${path}: 昇順でない (${values.join(', ')})`);
  }
}

/** 生の JSON 群を検査して GameData にする。問題はまとめて GameDataError で返す */
export function validateGameData(raw: Record<keyof GameData, unknown>): GameData {
  const errors: string[] = [];
  for (const key of Object.keys(SHAPES) as (keyof GameData)[]) checkShape(raw[key], SHAPES[key], key, errors);
  if (errors.length > 0) throw new GameDataError(errors);

  const data = raw as unknown as GameData;
  const hobbyIds = uniqueIds(data.hobbies, 'hobbies', errors);
  const homeIds = uniqueIds(data.homes, 'homes', errors);
  uniqueIds(data.enemies, 'enemies', errors);
  uniqueIds(data.customers, 'customers', errors);
  uniqueIds(data.drinks, 'drinks', errors);
  uniqueIds(data.selfCare, 'self_care', errors);
  uniqueIds(data.rivals, 'rivals', errors);
  uniqueIds(data.buildings, 'buildings', errors);

  const p = data.player;
  if (!homeIds.has(p.initial.home_id)) errors.push(`player.initial.home_id: 無い家 "${p.initial.home_id}"`);
  positive(p.initial.max_hp, 'player.initial.max_hp', errors);
  positive(p.initial.max_mp, 'player.initial.max_mp', errors);
  if (p.level_curve.growth < 1) errors.push('player.level_curve.growth: 1 未満');
  probability(p.back_rate, 'player.back_rate', errors);
  probability(p.late_sales_multiplier, 'player.late_sales_multiplier', errors);
  if (!(p.actions_per_day >= 1)) errors.push('player.actions_per_day: 1 未満');

  const s = data.street;
  if (!(s.goal_appear_seconds < s.duration_seconds)) errors.push('street.goal_appear_seconds: 制限時間より後');
  ascending(s.customer_spawn_seconds, 'street.customer_spawn_seconds', errors);
  for (const t of s.customer_spawn_seconds) {
    if (!(t >= 0 && t < s.duration_seconds)) errors.push(`street.customer_spawn_seconds: 制限時間の外 (${t})`);
  }
  if (s.max_companions < 1) errors.push('street.max_companions: 1 未満');
  ascending(s.street_level.exp_thresholds, 'street.street_level.exp_thresholds', errors);
  if (!(s.spawn.min_interval_seconds <= s.spawn.start_interval_seconds)) errors.push('street.spawn: 最短間隔が開始間隔より長い');
  const city = s.city;
  const inner = city.pitch - city.road_half_width * 2;
  if (!(inner > 0)) errors.push('street.city: 道が太すぎて区画が無い');
  if (2 * city.lot_size + city.lot_gap + 2 * city.lot_margin > inner) errors.push('street.city: 建物 2×2 が区画に収まらない');
  probability(city.empty_lot_chance, 'street.city.empty_lot_chance', errors);
  probability(city.plaza_block_chance, 'street.city.plaza_block_chance', errors);
  probability(city.landmark_block_chance, 'street.city.landmark_block_chance', errors);
  const blockRoom = inner - 2 * city.lot_margin;
  data.buildings.forEach((b, i) => {
    const at = `buildings[${i}] (${b.id})`;
    positive(b.width, `${at}.width`, errors);
    positive(b.depth, `${at}.depth`, errors);
    const room = b.landmark ? blockRoom : city.lot_size;
    if (Math.max(b.width, b.depth) > room) errors.push(`${at}: ${b.landmark ? '区画' : '区割り'}に収まらない`);
  });
  if (!data.buildings.some((b) => !b.landmark)) errors.push('buildings: 区割りに置ける小さい建物が無い');
  if (!(city.road_half_width * 2 > s.player.radius * 4)) errors.push('street.city.road_half_width: 自機が通れないほど狭い');
  positive(city.nav_cell, 'street.city.nav_cell', errors);
  if (!(city.min_alley >= s.player.radius * 2 + city.nav_cell)) errors.push('street.city.min_alley: 自機が通れて、経路のマスにも必ず映る幅（自機の直径 + マス 1 つ）より狭い');
  positive(s.view.iso_x, 'street.view.iso_x', errors);
  positive(s.view.iso_y, 'street.view.iso_y', errors);

  data.enemies.forEach((e, i) => {
    positive(e.max_hp, `enemies[${i}].max_hp`, errors);
    positive(e.radius, `enemies[${i}].radius`, errors);
    if (e.weight < 0) errors.push(`enemies[${i}].weight: 負`);
  });
  if (!data.enemies.some((e) => e.from_seconds <= 0 && e.weight > 0)) errors.push('enemies: 0 秒から湧く敵が居ない');

  data.customers.forEach((c, i) => {
    const at = `customers[${i}] (${c.id})`;
    if (!STAT_IDS.includes(c.preference)) errors.push(`${at}.preference: 知らない能力 "${c.preference}"`);
    if (!hobbyIds.has(c.hobby)) errors.push(`${at}.hobby: 無い趣味 "${c.hobby}"`);
    if (!(c.wallet_min > 0 && c.wallet_min <= c.wallet_max)) errors.push(`${at}.wallet: min/max が不正`);
    if (VIBES.every((v) => c.mood_weights[v] <= 0)) errors.push(`${at}.mood_weights: すべて 0`);
    if (c.min_stage < 1) errors.push(`${at}.min_stage: 1 未満`);
  });
  if (!data.customers.some((c) => c.min_stage <= p.initial.stage_level && c.weight > 0)) {
    errors.push('customers: 初期ステージで出るお客が居ない');
  }

  ascending(data.drinks.map((d) => d.price), 'drinks.price', errors);
  data.drinks.forEach((d, i) => {
    positive(d.price, `drinks[${i}].price`, errors);
    probability(d.base_success, `drinks[${i}].base_success`, errors);
  });

  const sv = data.service;
  probability(sv.min_success, 'service.min_success', errors);
  probability(sv.max_success, 'service.max_success', errors);
  if (!(sv.min_success < sv.max_success)) errors.push('service: min_success >= max_success');
  if (sv.patience < 1) errors.push('service.patience: 1 未満');
  if (sv.mood_lines_per_mood < 1) errors.push('service.mood_lines_per_mood: 1 未満');

  data.selfCare.forEach((item, i) => {
    const at = `self_care[${i}] (${item.id})`;
    if (!STAT_IDS.includes(item.category)) errors.push(`${at}.category: 知らない能力 "${item.category}"`);
    for (const stat of Object.keys(item.gains)) {
      if (!STAT_IDS.includes(stat as never)) errors.push(`${at}.gains: 知らない能力 "${stat}"`);
    }
    for (const hobby of Object.keys(item.hobbies)) {
      if (!hobbyIds.has(hobby)) errors.push(`${at}.hobbies: 無い趣味 "${hobby}"`);
    }
    if (item.cost < 0) errors.push(`${at}.cost: 負`);
    const has = (key: 'duration_days' | 'rebound' | 'monthly_fee') => item[key] !== undefined;
    if (item.kind === 'timed') {
      if (!(item.duration_days !== undefined && item.duration_days >= 1)) errors.push(`${at}: timed は duration_days（1 以上）が要る`);
      if (item.rebound !== undefined && item.rebound < 0) errors.push(`${at}.rebound: 負`);
      if (has('monthly_fee')) errors.push(`${at}: timed に monthly_fee は付けない`);
    } else if (item.kind === 'subscription') {
      if (!(item.monthly_fee !== undefined && item.monthly_fee > 0)) errors.push(`${at}: subscription は monthly_fee（正）が要る`);
      if (has('duration_days') || has('rebound')) errors.push(`${at}: subscription に duration_days / rebound は付けない`);
    } else if (item.kind === 'instant') {
      if (has('duration_days') || has('rebound') || has('monthly_fee')) errors.push(`${at}: instant に期間・反動・月額は付けない`);
    } else {
      errors.push(`${at}.kind: 知らない種類 "${item.kind}"`);
    }
  });

  const gates = new Set<number>();
  data.rivals.forEach((r, i) => {
    const at = `rivals[${i}] (${r.id})`;
    if (r.gate_stage <= p.initial.stage_level) errors.push(`${at}.gate_stage: 初期ステージ以下`);
    if (gates.has(r.gate_stage)) errors.push(`${at}.gate_stage: 同じステージに 2 人`);
    gates.add(r.gate_stage);
    positive(r.sales_target, `${at}.sales_target`, errors);
    positive(r.move_speed, `${at}.move_speed`, errors);
    positive(r.steal_radius, `${at}.steal_radius`, errors);
  });

  if (data.loginBonus.cycle.length === 0) errors.push('login_bonus.cycle: 空');
  data.loginBonus.cycle.forEach((r, i) => {
    if (!['money', 'hp_full', 'mp_full'].includes(r.kind)) errors.push(`login_bonus.cycle[${i}].kind: 知らない種類 "${r.kind}"`);
    if (r.kind === 'money' && !(r.amount > 0)) errors.push(`login_bonus.cycle[${i}].amount: お金は正の額`);
  });

  const rt = p.realtime;
  if (rt.hp_per_minute < 0 || rt.mp_per_minute < 0 || rt.drunk_per_minute < 0) errors.push('player.realtime: 負の回復');
  if (!(rt.max_elapsed_minutes > 0)) errors.push('player.realtime.max_elapsed_minutes: 0 以下');

  const c = data.calendar;
  if (!(c.closed_weekday >= 0 && c.closed_weekday <= 6)) errors.push('calendar.closed_weekday: 0〜6 の外');
  if (!(c.start_month >= 1 && c.start_month <= 12)) errors.push('calendar.start_month: 1〜12 の外');

  const letters = data.rank.letters;
  if (letters.length === 0 || letters[0]?.min !== 0) errors.push('rank.letters: 先頭の min が 0 でない');
  ascending(letters.map((l) => l.min), 'rank.letters.min', errors);

  if (errors.length > 0) throw new GameDataError(errors);
  return data;
}
