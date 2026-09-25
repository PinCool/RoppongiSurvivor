import type { GameData, RivalData } from '../data/types';
import type { PlayerState } from './playerState';

/** いまのステージに立ちはだかるライバル（倒していなければ）。いなければ null */
export function activeRival(state: PlayerState, data: GameData): RivalData | null {
  return data.rivals.find((r) => r.gate_stage === state.stageLevel && !state.defeatedRivals.includes(r.id)) ?? null;
}
