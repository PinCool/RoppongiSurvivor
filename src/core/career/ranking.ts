import type { GameData } from '../data/types';
import { Rng } from '../rng';
import type { PlayerState } from './playerState';

/**
 * 店内の月間売上ランキング。主人公の今月の売上（monthSales）と、NPC のキャストの売上を並べる。
 * NPC は 1 日ごとに伸び（ステージが上がるほど手強い）、月末に順位で報酬を配ってから 0 に戻す。
 * サーバのランキング（企画書の月間売上ランキング）ができるまでの、端末の中で完結する版。
 */
export const PLAYER_ID = 'player';

export interface Standing {
  id: string;
  sales: number;
  rank: number;
}

export function standings(state: PlayerState, data: GameData): Standing[] {
  const rows = [
    { id: PLAYER_ID, sales: state.monthSales },
    ...data.ranking.npcs.map((n) => ({ id: n.id, sales: state.npcSales[n.id] ?? 0 })),
  ];
  // 同じ売上なら主人公を下に。月初は全員 0 なので、何もしないうちに「1 位」と出ないように（下から追い抜いていく）
  rows.sort((a, b) => b.sales - a.sales || (a.id === PLAYER_ID ? 1 : b.id === PLAYER_ID ? -1 : 0));
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

export function playerRank(state: PlayerState, data: GameData): number {
  return standings(state, data).find((s) => s.id === PLAYER_ID)!.rank;
}

/** NPC の 1 日ぶんの売上を足す（営業日だけ呼ぶ） */
export function advanceNpcs(state: PlayerState, data: GameData, rng: Rng): void {
  const growth = 1 + data.ranking.growth_per_stage * (state.stageLevel - 1);
  for (const npc of data.ranking.npcs) {
    const today = Math.round(rng.range(npc.daily_min, npc.daily_max) * growth);
    state.npcSales[npc.id] = (state.npcSales[npc.id] ?? 0) + today;
  }
}

export interface MonthResult {
  rank: number;
  reward: number;
  top: Standing[];
}

/** 月末の締め: 順位の報酬を渡し、今月の売上を 0 に戻す */
export function settleMonth(state: PlayerState, data: GameData): MonthResult {
  const table = standings(state, data);
  const rank = table.find((s) => s.id === PLAYER_ID)!.rank;
  const reward = data.ranking.rewards.find((r) => r.rank === rank)?.money ?? 0;
  state.money += reward;
  state.monthSales = 0;
  state.npcSales = {};
  return { rank, reward, top: table.slice(0, 3) };
}
