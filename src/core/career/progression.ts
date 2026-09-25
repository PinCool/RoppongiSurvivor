import type { PlayerData } from '../data/types';
import type { PlayerState } from './playerState';

/** level から level + 1 に必要な経験値 */
export function expToNext(level: number, curve: PlayerData['level_curve']): number {
  return Math.round(curve.base_exp * Math.pow(curve.growth, level - 1));
}

/** 経験値を足してレベルを上げる。上がった回数を返す。上限レベルでは経験値を貯めない */
export function addExp(state: PlayerState, amount: number, player: PlayerData): number {
  let gained = 0;
  state.exp += Math.max(0, Math.floor(amount));
  while (state.level < player.level_curve.max_level) {
    const need = expToNext(state.level, player.level_curve);
    if (state.exp < need) break;
    state.exp -= need;
    state.level += 1;
    state.maxHp += player.level_up_gains.max_hp;
    state.maxMp += player.level_up_gains.max_mp;
    gained += 1;
  }
  if (state.level >= player.level_curve.max_level) state.exp = 0;
  return gained;
}
