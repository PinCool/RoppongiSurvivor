import type { GameData, RegularsData } from '../data/types';
import type { PlayerState } from './playerState';

/**
 * お客さん図鑑と常連。接客したお客の種類ごとに回数と売上を記録し、回数で常連 Lv が上がる。
 * 常連 Lv は接客の成功率と財布（使ってくれる上限）を上げる（serviceSession が読む）。
 */
export function regularLevel(visits: number, regulars: RegularsData): number {
  let level = 0;
  for (const need of regulars.level_visits) if (visits >= need) level++;
  return level;
}

/** 常連 Lv（まだ会っていなければ 0） */
export function regularLevelOf(state: PlayerState, data: GameData, typeId: string): number {
  return regularLevel(state.book[typeId]?.visits ?? 0, data.regulars);
}

/** お客の種類 → 常連 Lv（接客に渡す） */
export function regularLevels(state: PlayerState, data: GameData): Record<string, number> {
  return Object.fromEntries(data.customers.map((c) => [c.id, regularLevelOf(state, data, c.id)]));
}

export function isNewCustomer(state: PlayerState, typeId: string): boolean {
  return (state.book[typeId]?.visits ?? 0) === 0;
}

export interface VisitResult {
  typeId: string;
  firstTime: boolean;
  levelBefore: number;
  levelAfter: number;
}

/** 接客を 1 回記録する */
export function recordVisit(state: PlayerState, data: GameData, typeId: string, sales: number): VisitResult {
  const entry = state.book[typeId] ?? { visits: 0, totalSales: 0, bestSales: 0 };
  const levelBefore = regularLevel(entry.visits, data.regulars);
  entry.visits += 1;
  entry.totalSales += sales;
  entry.bestSales = Math.max(entry.bestSales, sales);
  state.book[typeId] = entry;
  return { typeId, firstTime: entry.visits === 1, levelBefore, levelAfter: regularLevel(entry.visits, data.regulars) };
}
