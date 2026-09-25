import type { GameData, StatId } from '../data/types';

export const SAVE_VERSION = 1;

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
  };
}

export function statOf(state: PlayerState, stat: StatId): number {
  return state[stat];
}

export function hobbyLevel(state: PlayerState, hobbyId: string): number {
  return state.hobbies[hobbyId] ?? 0;
}

/** 読み込んだセーブが今の形か確かめる。壊れていれば null（呼び側で新規作成へ） */
export function deserializePlayer(json: string): PlayerState | null {
  try {
    const parsed = JSON.parse(json) as Partial<PlayerState>;
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
