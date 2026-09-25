import type { GameData } from '../data/types';
import type { PlayerState } from './playerState';

export interface RecoveryResult {
  hp: number;
  mp: number;
  drunk: number;
}

/**
 * 実時間での回復。前回からの経過分だけ HP・MP が戻り、酔いが抜ける（アプリを閉じていても進む）。
 * 端数は lastRealtimeMs を「使った分だけ」進めて持ち越す。時計が戻った（端末の時刻変更）ときは基準だけ付け直す。
 * 時刻は呼び側が渡す（Core は時計を読まない）。
 */
export function applyRealtimeRecovery(state: PlayerState, data: GameData, nowMs: number): RecoveryResult {
  const none = { hp: 0, mp: 0, drunk: 0 };
  if (state.lastRealtimeMs <= 0 || nowMs < state.lastRealtimeMs) {
    state.lastRealtimeMs = nowMs;
    return none;
  }
  const rt = data.player.realtime;
  const elapsedMinutes = Math.min((nowMs - state.lastRealtimeMs) / 60000, rt.max_elapsed_minutes);
  const whole = Math.floor(elapsedMinutes);
  if (whole < 1) return none;

  const before = { hp: state.hp, mp: state.mp, drunk: state.drunk };
  state.hp = Math.min(state.maxHp, state.hp + Math.floor(whole * rt.hp_per_minute));
  state.mp = Math.min(state.maxMp, state.mp + Math.floor(whole * rt.mp_per_minute));
  state.drunk = Math.max(0, state.drunk - Math.floor(whole * rt.drunk_per_minute));
  // 頭打ちに掛かったら今を基準に、掛からなければ使った分（整数分）だけ進める
  state.lastRealtimeMs = elapsedMinutes >= rt.max_elapsed_minutes ? nowMs : state.lastRealtimeMs + whole * 60000;
  return { hp: state.hp - before.hp, mp: state.mp - before.mp, drunk: before.drunk - state.drunk };
}
