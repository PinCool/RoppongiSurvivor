import { describe, expect, it, vi } from 'vitest';

// 1 本あたり数百 ms のシミュレーションを何十本も回すので、既定の 5 秒では足りない
vi.setConfig({ testTimeout: 60_000 });
import { playStreet, playStreetSim } from './bot';
import { freshData } from './helpers';

/**
 * 難易度の見張り。bot.ts の素直なボット（雑魚から離れ、お客に寄り、お店へ向かう）で種を変えて走らせる。
 * ボットは完璧に逃げ回るので人より上手い —— ここでの「余裕」は人にとっての「ちょうどいい」くらい。
 * 数値を変えてここが落ちたら、意図した難しさの変化かを確かめてから閾値を見直す。
 */
const memo = new Map<number, ReturnType<typeof compute>>();
function summarize(stage: number) {
  if (!memo.has(stage)) memo.set(stage, compute(stage, 12));
  return memo.get(stage)!;
}

function compute(stage: number, runs: number) {
  const outcomes = Array.from({ length: runs }, (_, i) => playStreet(freshData(), stage, 1000 + i));
  return {
    goalRate: outcomes.filter((o) => o.kind === 'goal').length / runs,
    avgHp: outcomes.reduce((s, o) => s + o.hp, 0) / runs,
    avgCompanions: outcomes.reduce((s, o) => s + o.companions.length, 0) / runs,
    maxTime: Math.max(...outcomes.map((o) => o.time)),
  };
}

describe('集客パートの難易度', () => {
  it('ステージ 1: 全員お店に着き、HP にも余裕があり、3 人連れて来られる', () => {
    const s = summarize(1);
    expect(s.goalRate).toBe(1);
    expect(s.avgHp).toBeGreaterThan(70);
    expect(s.avgCompanions).toBeGreaterThan(2.7);
  });

  it('ステージ 10: 手応えはあるが、上手く動けばほぼ着ける', () => {
    const s = summarize(10);
    expect(s.goalRate).toBeGreaterThanOrEqual(0.85);
    expect(s.avgHp).toBeLessThan(summarize(1).avgHp);
  });

  it('1 回の集客は 3 分以内に収まる（モバイル向けのテンポ）', () => {
    // 遅刻は制限時間ちょうどの次のティックで終わるので、1 ティック分の余裕を見る
    expect(summarize(1).maxTime).toBeLessThanOrEqual(freshData().street.duration_seconds + 1 / 60);
  });

  it('立ち止まっていると囲まれてやられる（動く意味がある）', () => {
    const outcomes = Array.from({ length: 10 }, (_, i) => playStreet(freshData(), 1, 2000 + i, true));
    expect(outcomes.filter((o) => o.kind === 'down').length).toBeGreaterThanOrEqual(7);
  });
});

describe('ライバル戦の難易度', () => {
  it('クリスタルの関門: 上手く動けば半分以上のお客は守れるが、ときどき横取りされる', () => {
    const data = freshData();
    const crystal = data.rivals.find((r) => r.id === 'crystal')!;
    // 横取りの数はお客の湧き位置で大きくぶれる（30 本ずつの窓で 1.4〜2.0）。12 本では乱数の並びが変わるだけで閾値をまたぐので 30 本
    const runs = Array.from({ length: 30 }, (_, i) => playStreetSim(freshData(), crystal.gate_stage, 3000 + i));
    const companions = runs.reduce((s, r) => s + r.outcome!.companions.length, 0) / runs.length;
    const steals = runs.reduce((s, r) => s + r.rival!.steals, 0) / runs.length;
    expect(companions).toBeGreaterThanOrEqual(1.5); // 3 人中の半分。ボットでいまは 1.7〜1.8
    expect(steals).toBeGreaterThan(0.2);
  });
});
