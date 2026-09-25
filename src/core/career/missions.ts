import type { GameData, MissionData, MissionKind, MissionReward } from '../data/types';
import { Rng } from '../rng';
import type { PlayerState } from './playerState';

/**
 * デイリーミッション。端末の暦で日が変わったら、その日付から決まる 3 つ（誰でも同じ日なら同じ）を並べ直す。
 * 進みは出勤の精算・自分磨きから record() で積む。報酬は 1 つずつ受け取り、全部受け取ると追加の報酬。
 */
export interface MissionView {
  id: string;
  kind: MissionKind;
  target: number;
  progress: number;
  reward: MissionReward;
  done: boolean;
  claimed: boolean;
}

/** その日のミッションが無ければ作る。作り直したら true */
export function ensureDailyMissions(state: PlayerState, data: GameData, todayKey: string): boolean {
  if (state.missions.date === todayKey) return false;
  const rng = new Rng(hashDate(todayKey));
  const pool = [...data.missions.pool];
  const ids: string[] = [];
  const usedKinds = new Set<MissionKind>();
  // 同じ種類が 2 つ並ばないように選ぶ（足りなければ重複を許す）
  for (let guard = 0; ids.length < data.missions.daily_count && guard < 200; guard++) {
    const pick = rng.pick(pool);
    if (ids.includes(pick.id)) continue;
    if (usedKinds.has(pick.kind) && guard < 100) continue;
    ids.push(pick.id);
    usedKinds.add(pick.kind);
  }
  state.missions = { date: todayKey, ids, progress: {}, claimed: [], allClaimed: false };
  return true;
}

/** 進みを積む。shift_sales だけは「1 回の出勤の売上」なので最大値で持つ */
export function recordMission(state: PlayerState, data: GameData, kind: MissionKind, amount: number): void {
  for (const id of state.missions.ids) {
    const def = data.missions.pool.find((m) => m.id === id);
    if (!def || def.kind !== kind) continue;
    const now = state.missions.progress[id] ?? 0;
    state.missions.progress[id] = kind === 'shift_sales' ? Math.max(now, amount) : now + amount;
  }
}

export function missionViews(state: PlayerState, data: GameData): MissionView[] {
  return state.missions.ids.flatMap((id) => {
    const def = data.missions.pool.find((m) => m.id === id);
    if (!def) return [];
    const progress = Math.min(def.target, state.missions.progress[id] ?? 0);
    return [{ id, kind: def.kind, target: def.target, progress, reward: def.reward, done: progress >= def.target, claimed: state.missions.claimed.includes(id) }];
  });
}

/** 受け取れる報酬の数（ホームのバッジ用。全部クリアの追加報酬も 1 と数える） */
export function claimableCount(state: PlayerState, data: GameData): number {
  const views = missionViews(state, data);
  const singles = views.filter((v) => v.done && !v.claimed).length;
  const all = views.length > 0 && views.every((v) => v.claimed) && !state.missions.allClaimed ? 1 : 0;
  return singles + all;
}

export function claimMission(state: PlayerState, data: GameData, id: string): MissionReward | null {
  const view = missionViews(state, data).find((v) => v.id === id);
  if (!view || !view.done || view.claimed) return null;
  state.missions.claimed.push(id);
  applyReward(state, view.reward);
  return view.reward;
}

/** 全部クリアの追加報酬（全部を受け取ってから 1 回だけ） */
export function claimAllBonus(state: PlayerState, data: GameData): MissionReward | null {
  const views = missionViews(state, data);
  if (views.length === 0 || !views.every((v) => v.claimed) || state.missions.allClaimed) return null;
  state.missions.allClaimed = true;
  applyReward(state, data.missions.complete_all_reward);
  return data.missions.complete_all_reward;
}

function applyReward(state: PlayerState, reward: MissionReward): void {
  switch (reward.kind) {
    case 'money':
      state.money += reward.amount;
      break;
    case 'mp_full':
      state.mp = state.maxMp;
      break;
    case 'ad_refill':
      state.adRefillsLeft += reward.amount;
      break;
  }
}

function hashDate(key: string): number {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export type { MissionData };
