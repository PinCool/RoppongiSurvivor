import type { GameData, SelfCareData, StatId } from '../data/types';
import type { PlayerState } from './playerState';

export type SelfCareBlock = 'money' | 'actions' | 'level' | 'subscribed' | null;

/** できない理由（できるなら null）。UI はこれで押せない理由を出し分ける */
export function selfCareBlock(state: PlayerState, item: SelfCareData): SelfCareBlock {
  if (state.level < item.min_level) return 'level';
  if (item.kind === 'subscription' && state.subscriptions.includes(item.id)) return 'subscribed';
  if (state.actionsLeft <= 0) return 'actions';
  if (state.money < item.cost) return 'money';
  return null;
}

export interface SelfCareResult {
  stats: Partial<Record<StatId, number>>;
  hobbies: Record<string, number>;
  /** 期間つきなら切れる通算日 */
  expiresDay: number | null;
}

/**
 * 自分磨きをする。
 * instant は素の能力値へ足す。timed は効き目を登録（やり直しは延長で、重ねがけはしない）。subscription は契約する。
 */
export function applySelfCare(state: PlayerState, item: SelfCareData): SelfCareResult {
  const block = selfCareBlock(state, item);
  if (block) throw new Error(`自分磨きできない: ${item.id} (${block})`);
  state.money -= item.cost;
  state.actionsLeft -= 1;
  for (const [hobby, gain] of Object.entries(item.hobbies)) state.hobbies[hobby] = (state.hobbies[hobby] ?? 0) + gain;

  let expiresDay: number | null = null;
  if (item.kind === 'instant') {
    for (const [stat, gain] of Object.entries(item.gains) as [StatId, number][]) state[stat] += gain;
  } else if (item.kind === 'timed') {
    expiresDay = state.day + (item.duration_days ?? 1);
    const current = state.effects.find((e) => e.itemId === item.id);
    if (current) current.expiresDay = expiresDay;
    else state.effects.push({ itemId: item.id, expiresDay });
  } else {
    state.subscriptions.push(item.id);
  }
  return { stats: { ...item.gains }, hobbies: { ...item.hobbies }, expiresDay };
}

/** 月額の解約（月末の引き落としから外れ、効き目もすぐ切れる） */
export function cancelSubscription(state: PlayerState, itemId: string): boolean {
  const index = state.subscriptions.indexOf(itemId);
  if (index < 0) return false;
  state.subscriptions.splice(index, 1);
  return true;
}

/** 月末に引き落とされる月額の合計 */
export function monthlyFees(state: PlayerState, data: GameData): number {
  return state.subscriptions.reduce((sum, id) => sum + (data.selfCare.find((item) => item.id === id)?.monthly_fee ?? 0), 0);
}

/** 期間つきの効き目の残り日数（効いていなければ 0） */
export function daysLeft(state: PlayerState, itemId: string): number {
  const effect = state.effects.find((e) => e.itemId === itemId);
  return effect ? Math.max(0, effect.expiresDay - state.day) : 0;
}
