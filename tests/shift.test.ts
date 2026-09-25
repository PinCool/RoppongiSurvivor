import { describe, expect, it } from 'vitest';
import { createPlayer } from '../src/core/career/playerState';
import { applyShift } from '../src/core/career/shift';
import type { ServiceResult } from '../src/core/service/serviceSession';
import type { StreetOutcome } from '../src/core/street/streetSim';
import { freshData } from './helpers';

const street = (kind: StreetOutcome['kind']): StreetOutcome => ({
  kind, companions: [], streetExp: 20, kills: 30, hp: 55, mp: 40, time: 150,
});
const service: ServiceResult = { sales: 50000, mpLeft: 12, drunkGained: 18, guests: [{ typeId: 'bandman', sales: 50000, left: false }], champagneOrders: 1, vibeMatches: 1 };

describe('出勤の精算', () => {
  it('取り分は売上 × バック率、経験値は集客と売上から、ステージが上がる', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    const r = applyShift(s, data, street('goal'), service);
    expect(r.sales).toBe(50000);
    expect(r.earned).toBe(25000);
    expect(s.money).toBe(data.player.initial.money + 25000);
    expect(r.exp).toBe(20 * 2 + 50 * 3);
    expect(r.levelsGained).toBe(1);
    expect(s.stageLevel).toBe(2);
    expect(s.hp).toBe(55);
    expect(s.mp).toBe(12);
    expect(s.drunk).toBe(18);
    expect(s.workedToday).toBe(true);
    expect(s.totalSales).toBe(50000);
  });

  it('遅刻は売上が減り、ステージは上がらない', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    const r = applyShift(s, data, street('late'), service);
    expect(r.sales).toBe(35000);
    expect(s.stageLevel).toBe(1);
  });

  it('途中帰宅は接客なし。MP は集客の残り', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    const r = applyShift(s, data, street('down'), null);
    expect(r.sales).toBe(0);
    expect(r.earned).toBe(0);
    expect(s.mp).toBe(40);
  });
});
