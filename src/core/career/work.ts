import type { GameData } from '../data/types';
import { isClosedDay } from './calendar';
import type { PlayerState } from './playerState';

export type WorkBlock = 'closed' | 'worked' | 'no_hp' | 'game_over' | null;

/** 出勤できない理由（できるなら null） */
export function workBlock(state: PlayerState, data: GameData): WorkBlock {
  if (state.gameOver) return 'game_over';
  if (isClosedDay(state.day, data.calendar)) return 'closed';
  if (state.workedToday) return 'worked';
  if (state.hp <= 0) return 'no_hp';
  return null;
}

/** 広告 1 回ぶんの権利を使う（集客中は MP がシミュレーション側にあるので、回数だけここで減らす） */
export function spendAdRefill(state: PlayerState): boolean {
  if (state.adRefillsLeft <= 0) return false;
  state.adRefillsLeft -= 1;
  return true;
}

/** 自宅で広告を見て MP 全回復。満タンなら権利を使わない。できたら true */
export function useAdRefill(state: PlayerState): boolean {
  if (state.mp >= state.maxMp || !spendAdRefill(state)) return false;
  state.mp = state.maxMp;
  return true;
}
