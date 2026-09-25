import type { GameData, LoginRewardKind } from '../data/types';
import type { PlayerState } from './playerState';

export interface LoginReward {
  kind: LoginRewardKind;
  amount: number;
  /** 連続ログインの日数（1 始まり） */
  streak: number;
}

/** "YYYY-MM-DD" の前日。暦の計算だけで、時計は読まない */
export function previousDateKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d - 1));
  return date.toISOString().slice(0, 10);
}

/**
 * 今日のログインボーナスを受け取る（1 日 1 回）。昨日も受け取っていれば連続、途切れたら 1 日目から。
 * todayKey は端末の暦の "YYYY-MM-DD"（呼び側が作る）。受け取り済みなら null。
 */
export function claimLoginBonus(state: PlayerState, data: GameData, todayKey: string): LoginReward | null {
  if (state.lastLoginDate === todayKey) return null;
  const continued = state.lastLoginDate !== '' && state.lastLoginDate === previousDateKey(todayKey);
  state.loginStreak = continued ? state.loginStreak + 1 : 1;
  state.lastLoginDate = todayKey;
  const cycle = data.loginBonus.cycle;
  const reward = cycle[(state.loginStreak - 1) % cycle.length];
  if (!reward) throw new Error('ログインボーナスの表が空');
  switch (reward.kind) {
    case 'money':
      state.money += reward.amount;
      break;
    case 'hp_full':
      state.hp = state.maxHp;
      break;
    case 'mp_full':
      state.mp = state.maxMp;
      break;
  }
  return { kind: reward.kind, amount: reward.amount, streak: state.loginStreak };
}
