import { describe, expect, it } from 'vitest';
import { endDay } from '../src/core/career/day';
import { isNewCustomer, regularLevel, regularLevelOf, regularLevels } from '../src/core/career/book';
import { claimAllBonus, claimMission, claimableCount, ensureDailyMissions, missionViews, recordMission } from '../src/core/career/missions';
import { createPlayer, deserializePlayer } from '../src/core/career/playerState';
import { PLAYER_ID, playerRank, standings } from '../src/core/career/ranking';
import { applyShift } from '../src/core/career/shift';
import { ServiceSession } from '../src/core/service/serviceSession';
import type { StreetOutcome } from '../src/core/street/streetSim';
import { freshData } from './helpers';

const street = (kills = 80, companions = 2): StreetOutcome => ({
  kind: 'goal', companions: Array.from({ length: companions }, () => ({ typeId: 'bandman', wallet: 10000 })), streetExp: 10, kills, hp: 50, mp: 20, time: 130,
});

describe('デイリーミッション', () => {
  it('日付ごとに決まった 3 つ（同じ日なら同じ・種類は重ならない）、日が変わると作り直す', () => {
    const data = freshData();
    const a = createPlayer(data, 'a', 1);
    const b = createPlayer(data, 'b', 999);
    expect(ensureDailyMissions(a, data, '2026-09-25')).toBe(true);
    ensureDailyMissions(b, data, '2026-09-25');
    expect(a.missions.ids).toEqual(b.missions.ids);
    expect(a.missions.ids).toHaveLength(data.missions.daily_count);
    const kinds = a.missions.ids.map((id) => data.missions.pool.find((m) => m.id === id)!.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(ensureDailyMissions(a, data, '2026-09-25')).toBe(false);
    expect(ensureDailyMissions(a, data, '2026-09-26')).toBe(true);
    expect(a.missions.progress).toEqual({});
  });

  it('進みが目標に届いたら 1 回だけ受け取れ、全部受け取ると追加の報酬', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    ensureDailyMissions(s, data, '2026-09-25');
    for (const v of missionViews(s, data)) recordMission(s, data, v.kind, v.target);
    expect(claimableCount(s, data)).toBe(3);
    const money = s.money;
    for (const v of missionViews(s, data)) expect(claimMission(s, data, v.id)).not.toBeNull();
    expect(claimMission(s, data, s.missions.ids[0]!)).toBeNull();
    expect(claimableCount(s, data)).toBe(1);
    expect(claimAllBonus(s, data)).toEqual(data.missions.complete_all_reward);
    expect(claimAllBonus(s, data)).toBeNull();
    expect(claimableCount(s, data)).toBe(0);
    expect(s.money).toBeGreaterThan(money);
  });

  it('1 回の出勤の売上は「最大」、撃退数などは「積み上げ」で数える', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    s.missions = { date: 'x', ids: ['sales_20000', 'kills_60'], progress: {}, claimed: [], allClaimed: false };
    recordMission(s, data, 'shift_sales', 15000);
    recordMission(s, data, 'shift_sales', 12000);
    recordMission(s, data, 'kills', 30);
    recordMission(s, data, 'kills', 30);
    expect(s.missions.progress).toEqual({ sales_20000: 15000, kills_60: 60 });
  });

  it('出勤の精算がミッションを進める', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    s.missions = { date: 'x', ids: ['kills_60', 'companions_3', 'champagne_1'], progress: {}, claimed: [], allClaimed: false };
    applyShift(s, data, street(70, 2), { sales: 30000, mpLeft: 0, drunkGained: 0, guests: [], champagneOrders: 1, vibeMatches: 0 });
    expect(s.missions.progress).toMatchObject({ kills_60: 70, companions_3: 2, champagne_1: 1 });
  });
});

describe('お客さん図鑑と常連', () => {
  it('接客した回数で常連 Lv が上がる（1 / 3 / 6 / 10 回）', () => {
    const r = freshData().regulars;
    expect([0, 1, 2, 3, 5, 6, 10, 50].map((v) => regularLevel(v, r))).toEqual([0, 1, 1, 2, 2, 3, 4, 4]);
  });

  it('出勤の精算で図鑑が埋まる（初めて・最高売上・常連 Lv の変化）', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    expect(isNewCustomer(s, 'bandman')).toBe(true);
    const r1 = applyShift(s, data, street(), { sales: 8000, mpLeft: 0, drunkGained: 0, guests: [{ typeId: 'bandman', sales: 8000, left: false }], champagneOrders: 0, vibeMatches: 0 });
    expect(r1.visits).toEqual([{ typeId: 'bandman', firstTime: true, levelBefore: 0, levelAfter: 1 }]);
    applyShift(s, data, street(), { sales: 3000, mpLeft: 0, drunkGained: 0, guests: [{ typeId: 'bandman', sales: 3000, left: true }], champagneOrders: 0, vibeMatches: 0 });
    expect(s.book.bandman).toEqual({ visits: 2, totalSales: 11000, bestSales: 8000 });
    expect(isNewCustomer(s, 'bandman')).toBe(false);
    expect(regularLevels(s, data).bandman).toBe(1);
  });

  it('常連は成功率が上がり、財布の紐もゆるい', () => {
    const data = freshData();
    const player = { mp: 100, beauty: 10, intellect: 10, sense: 10, hobbies: {} };
    const plain = new ServiceSession(data, player, [{ typeId: 'bandman', wallet: 10000 }], 3);
    const regular = new ServiceSession(data, { ...player, regulars: { bandman: 3 } }, [{ typeId: 'bandman', wallet: 10000 }], 3);
    expect(regular.current!.wallet).toBe(Math.round(10000 * (1 + 3 * data.regulars.wallet_bonus_per_level)));
    plain.chooseVibe(plain.current!.mood);
    regular.chooseVibe(regular.current!.mood);
    const champagne = data.drinks.find((d) => d.id === 'champagne')!;
    expect(regular.successChance(champagne) - plain.successChance(champagne)).toBeCloseTo(3 * data.regulars.success_bonus_per_level, 5);
    expect(regular.bonusTags().some((t) => t.kind === 'regular')).toBe(true);
  });
});

describe('店内の月間売上ランキング', () => {
  it('NPC は営業日ごとに売り上げ、主人公の売上と並べて順位が出る', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    for (let d = 0; d < 5; d++) endDay(s, data);
    for (const n of data.ranking.npcs) expect(s.npcSales[n.id]).toBeGreaterThan(0);
    const table = standings(s, data);
    expect(table).toHaveLength(data.ranking.npcs.length + 1);
    expect(table.map((r) => r.rank)).toEqual(table.map((_, i) => i + 1));
    expect(playerRank(s, data)).toBe(table.length); // まだ売上 0 なので最下位
    s.monthSales = 10_000_000;
    expect(playerRank(s, data)).toBe(1);
  });

  it('月末に順位の報酬を受け取り、今月の売上は 0 に戻る', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    s.day = 27;
    s.money = 1_000_000;
    s.monthSales = 10_000_000;
    const report = endDay(s, data);
    const reward = data.ranking.rewards.find((r) => r.rank === 1)!.money;
    expect(report.ranking).toMatchObject({ rank: 1, reward });
    expect(s.money).toBe(1_000_000 + reward - report.settlement!.rent);
    expect(s.monthSales).toBe(0);
    expect(s.npcSales).toEqual({});
  });

  it('同じ売上なら主人公が下（月初に何もしないうちに 1 位と出さない）', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    const table = standings(s, data);
    expect(table[table.length - 1]!.id).toBe(PLAYER_ID);
    expect(playerRank(s, data)).toBe(data.ranking.npcs.length + 1);
  });

  it('出勤の売上が今月の売上に積まれる', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    applyShift(s, data, street(), { sales: 12345, mpLeft: 0, drunkGained: 0, guests: [], champagneOrders: 0, vibeMatches: 0 });
    expect(s.monthSales).toBe(12345);
  });
});

describe('セーブの引き継ぎ（版 3）', () => {
  it('版 2 のセーブは、ミッション・図鑑・ランキングを足して読める', () => {
    const data = freshData();
    const v3 = createPlayer(data, 'ゆい', 3);
    const { missions, book, monthSales, npcSales, ...rest } = v3;
    void [missions, book, monthSales, npcSales];
    expect(deserializePlayer(JSON.stringify({ ...rest, version: 2 }))).toEqual(v3);
  });

  it('版 1 のセーブも 2 段で引き継げる', () => {
    const data = freshData();
    const v3 = createPlayer(data, 'ゆい', 3);
    const { missions, book, monthSales, npcSales, effects, subscriptions, defeatedRivals, lastRealtimeMs, lastLoginDate, loginStreak, ...rest } = v3;
    void [missions, book, monthSales, npcSales, effects, subscriptions, defeatedRivals, lastRealtimeMs, lastLoginDate, loginStreak];
    expect(deserializePlayer(JSON.stringify({ ...rest, version: 1 }))).toEqual(v3);
  });

  it('常連 Lv はお客の種類ごとに引ける', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    s.book.it_ceo = { visits: 6, totalSales: 1, bestSales: 1 };
    expect(regularLevelOf(s, data, 'it_ceo')).toBe(3);
    expect(regularLevelOf(s, data, 'bandman')).toBe(0);
  });
});
