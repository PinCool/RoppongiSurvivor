import type { GameData, StatId } from '../data/types';
import { STAT_IDS } from '../data/types';
import type { PlayerState } from './playerState';

/**
 * いま効いている能力値 = 素の値 ＋ 期間つきの効き目 ＋ 月額の効き目。
 * 接客の判定・総合ランク・画面の表示はすべてこちらを使う（素の値を直接読まない）。
 */
export function effectiveStat(state: PlayerState, data: GameData, stat: StatId): number {
  return state[stat] + bonusStat(state, data, stat);
}

/** 素の値に上乗せされている分（画面の「+3」表示用） */
export function bonusStat(state: PlayerState, data: GameData, stat: StatId): number {
  let bonus = 0;
  for (const effect of state.effects) bonus += gainOf(data, effect.itemId, stat);
  for (const id of state.subscriptions) bonus += gainOf(data, id, stat);
  return bonus;
}

export function effectiveStats(state: PlayerState, data: GameData): Record<StatId, number> {
  return Object.fromEntries(STAT_IDS.map((stat) => [stat, effectiveStat(state, data, stat)])) as Record<StatId, number>;
}

function gainOf(data: GameData, itemId: string, stat: StatId): number {
  return data.selfCare.find((item) => item.id === itemId)?.gains[stat] ?? 0;
}
