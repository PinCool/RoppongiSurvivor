import { describe, expect, it } from 'vitest';
import { endDay } from '../src/core/career/day';
import { claimLoginBonus, previousDateKey } from '../src/core/career/loginBonus';
import { createPlayer, deserializePlayer } from '../src/core/career/playerState';
import { applyRealtimeRecovery } from '../src/core/career/recovery';
import { activeRival } from '../src/core/career/rival';
import { applySelfCare, cancelSubscription, daysLeft, monthlyFees, selfCareBlock } from '../src/core/career/selfCare';
import { applyShift } from '../src/core/career/shift';
import { bonusStat, effectiveStat } from '../src/core/career/stats';
import { byId } from '../src/core/data/gameData';
import type { StreetOutcome } from '../src/core/street/streetSim';
import { freshData } from './helpers';

const MIN = 60_000;

describe('自分磨き: 期間つき（エステ・整形）', () => {
  it('期間中だけ効き、切れると外れる。反動なしなら元の値に戻る', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    const nail = byId(data.selfCare, 'nail_salon');
    applySelfCare(s, nail);
    expect(s.beauty).toBe(10);
    expect(effectiveStat(s, data, 'beauty')).toBe(13);
    expect(bonusStat(s, data, 'sense')).toBe(1);
    expect(daysLeft(s, 'nail_salon')).toBe(7);
    for (let i = 0; i < 6; i++) endDay(s, data);
    expect(effectiveStat(s, data, 'beauty')).toBe(13);
    const report = endDay(s, data);
    expect(report.expired).toEqual([{ itemId: 'nail_salon', rebound: 0 }]);
    expect(effectiveStat(s, data, 'beauty')).toBe(10);
  });

  it('整形は切れると反動で元より下がる（企画書「再度やらないと元よりもステータスが下がる」）', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    s.level = 5;
    s.money = 1_000_000;
    const botox = byId(data.selfCare, 'botox');
    applySelfCare(s, botox);
    expect(effectiveStat(s, data, 'beauty')).toBe(10 + 13);
    for (let i = 0; i < botox.duration_days!; i++) endDay(s, data);
    expect(effectiveStat(s, data, 'beauty')).toBe(10 - botox.rebound!);
  });

  it('切れる前にやり直すと延長され、重ねがけにはならない', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    const nail = byId(data.selfCare, 'nail_salon');
    applySelfCare(s, nail);
    endDay(s, data);
    endDay(s, data);
    applySelfCare(s, nail);
    expect(s.effects).toHaveLength(1);
    expect(daysLeft(s, 'nail_salon')).toBe(7);
    expect(effectiveStat(s, data, 'beauty')).toBe(13);
  });
});

describe('自分磨き: 月額（ジム）', () => {
  it('契約中は効き、月末に家賃と一緒に引き落とされる。解約すると外れる', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    const gym = byId(data.selfCare, 'gym_24h');
    applySelfCare(s, gym);
    expect(selfCareBlock(s, gym)).toBe('subscribed');
    expect(effectiveStat(s, data, 'beauty')).toBe(13);
    expect(monthlyFees(s, data)).toBe(gym.monthly_fee);
    s.day = 27;
    const moneyBefore = s.money;
    const report = endDay(s, data);
    expect(report.settlement).toMatchObject({ rent: 95000, fees: gym.monthly_fee });
    expect(s.money).toBe(moneyBefore - 95000 - gym.monthly_fee!);
    expect(cancelSubscription(s, 'gym_24h')).toBe(true);
    expect(effectiveStat(s, data, 'beauty')).toBe(10);
    expect(monthlyFees(s, data)).toBe(0);
  });
});

describe('実時間での回復', () => {
  it('1 分ごとに HP・MP が戻り、酔いが抜ける。端数は持ち越す', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    s.hp = 10;
    s.mp = 10;
    s.drunk = 50;
    const t0 = 1_000_000;
    expect(applyRealtimeRecovery(s, data, t0)).toEqual({ hp: 0, mp: 0, drunk: 0 });
    const r = applyRealtimeRecovery(s, data, t0 + 10.5 * MIN);
    expect(r).toEqual({ hp: 10, mp: 5, drunk: 2 });
    expect(s.lastRealtimeMs).toBe(t0 + 10 * MIN);
    applyRealtimeRecovery(s, data, t0 + 11 * MIN);
    expect(s.hp).toBe(21);
  });

  it('長く閉じていても頭打ち（max_elapsed_minutes）、最大値は超えない', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    s.mp = 0;
    applyRealtimeRecovery(s, data, 1);
    applyRealtimeRecovery(s, data, 1 + 100_000 * MIN);
    expect(s.mp).toBe(Math.min(s.maxMp, data.player.realtime.max_elapsed_minutes * data.player.realtime.mp_per_minute));
    expect(s.hp).toBe(s.maxHp);
  });

  it('端末の時計が戻っても増えない（基準を付け直すだけ）', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    s.hp = 10;
    applyRealtimeRecovery(s, data, 10 * MIN);
    expect(applyRealtimeRecovery(s, data, 5 * MIN).hp).toBe(0);
    expect(s.lastRealtimeMs).toBe(5 * MIN);
  });
});

describe('ログインボーナス', () => {
  it('1 日 1 回。連続なら次の報酬、途切れたら 1 日目から', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    const money = s.money;
    expect(claimLoginBonus(s, data, '2026-09-25')).toEqual({ kind: 'money', amount: 5000, streak: 1 });
    expect(s.money).toBe(money + 5000);
    expect(claimLoginBonus(s, data, '2026-09-25')).toBeNull();
    s.mp = 0;
    expect(claimLoginBonus(s, data, '2026-09-26')).toMatchObject({ kind: 'mp_full', streak: 2 });
    expect(s.mp).toBe(s.maxMp);
    expect(claimLoginBonus(s, data, '2026-09-28')).toMatchObject({ streak: 1 });
  });

  it('表を一周したら先頭へ', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    const n = data.loginBonus.cycle.length;
    let key = '2026-01-01';
    const keys: string[] = [];
    for (let i = 0; i <= n; i++) {
      keys.push(key);
      const [y, m, d] = key.split('-').map(Number) as [number, number, number];
      key = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    }
    let last = null;
    for (const k of keys) last = claimLoginBonus(s, data, k);
    expect(last).toMatchObject({ streak: n + 1, kind: data.loginBonus.cycle[0]!.kind });
  });

  it('前日の計算は月・年をまたぐ', () => {
    expect(previousDateKey('2026-03-01')).toBe('2026-02-28');
    expect(previousDateKey('2027-01-01')).toBe('2026-12-31');
  });
});

describe('ライバルの関門', () => {
  const street = (kind: StreetOutcome['kind']): StreetOutcome => ({ kind, companions: [], streetExp: 0, kills: 0, hp: 50, mp: 10, time: 150 });
  const service = (sales: number) => ({ sales, mpLeft: 0, drunkGained: 0, guests: [] });

  it('関門のステージでだけ立ちはだかり、倒したら二度と出ない', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    const crystal = byId(data.rivals, 'crystal');
    expect(activeRival(s, data)).toBeNull();
    s.stageLevel = crystal.gate_stage;
    expect(activeRival(s, data)?.id).toBe('crystal');
    const r = applyShift(s, data, street('goal'), service(crystal.sales_target + 1));
    expect(r.rival).toEqual({ id: 'crystal', target: crystal.sales_target, won: true });
    expect(s.stageLevel).toBe(crystal.gate_stage + 1);
    s.stageLevel = crystal.gate_stage;
    expect(activeRival(s, data)).toBeNull();
  });

  it('売上が目標に届かなければ、お店に着いてもステージは進まない', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    const crystal = byId(data.rivals, 'crystal');
    s.stageLevel = crystal.gate_stage;
    const r = applyShift(s, data, street('goal'), service(crystal.sales_target));
    expect(r.rival?.won).toBe(false);
    expect(s.stageLevel).toBe(crystal.gate_stage);
    expect(s.defeatedRivals).toEqual([]);
  });

  it('遅刻は売上が足りても勝ちにならない', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    s.stageLevel = byId(data.rivals, 'crystal').gate_stage;
    expect(applyShift(s, data, street('late'), service(10_000_000)).rival?.won).toBe(false);
  });
});

describe('セーブの引き継ぎ', () => {
  it('版 1 のセーブは、増えた項目を足して読める', () => {
    const data = freshData();
    const v2 = createPlayer(data, 'ゆい', 3);
    const { effects, subscriptions, defeatedRivals, lastRealtimeMs, lastLoginDate, loginStreak, ...rest } = v2;
    void [effects, subscriptions, defeatedRivals, lastRealtimeMs, lastLoginDate, loginStreak];
    const v1 = { ...rest, version: 1 };
    expect(deserializePlayer(JSON.stringify(v1))).toEqual(v2);
  });
});
