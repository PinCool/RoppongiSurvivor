import type { SelfCareData, StatId } from '../data/types';
import type { PlayerState } from './playerState';

export type SelfCareBlock = 'money' | 'actions' | 'level' | null;

/** できない理由（できるなら null）。UI はこれで押せない理由を出し分ける */
export function selfCareBlock(state: PlayerState, item: SelfCareData): SelfCareBlock {
  if (state.level < item.min_level) return 'level';
  if (state.actionsLeft <= 0) return 'actions';
  if (state.money < item.cost) return 'money';
  return null;
}

export interface SelfCareResult {
  stats: Partial<Record<StatId, number>>;
  hobbies: Record<string, number>;
}

export function applySelfCare(state: PlayerState, item: SelfCareData): SelfCareResult {
  const block = selfCareBlock(state, item);
  if (block) throw new Error(`自分磨きできない: ${item.id} (${block})`);
  state.money -= item.cost;
  state.actionsLeft -= 1;
  for (const [stat, gain] of Object.entries(item.gains) as [StatId, number][]) state[stat] += gain;
  for (const [hobby, gain] of Object.entries(item.hobbies)) state.hobbies[hobby] = (state.hobbies[hobby] ?? 0) + gain;
  return { stats: { ...item.gains }, hobbies: { ...item.hobbies } };
}
