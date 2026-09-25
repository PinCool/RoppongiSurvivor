import { byId } from '../data/gameData';
import type { GameData } from '../data/types';
import type { PlayerState } from './playerState';

/** 総合ランクの数値。いろいろな要素を重み付きで足し合わせる（ランキングで争う値） */
export function totalRankScore(state: PlayerState, data: GameData): number {
  const w = data.rank.weights;
  const hobbySum = Object.values(state.hobbies).reduce((sum, level) => sum + level, 0);
  const score =
    state.level * w.level +
    state.beauty * w.beauty +
    state.intellect * w.intellect +
    state.sense * w.sense +
    state.maxHp * w.max_hp +
    state.maxMp * w.max_mp +
    hobbySum * w.hobby_level +
    byId(data.homes, state.homeId).rank_score;
  return Math.floor(score);
}

export function rankLetter(score: number, data: GameData): string {
  let letter = data.rank.letters[0]?.letter ?? '';
  for (const entry of data.rank.letters) if (score >= entry.min) letter = entry.letter;
  return letter;
}
