import { describe, expect, it } from 'vitest';
import { playStreet } from './bot';
import { freshData } from './helpers';

/**
 * 難易度の見張り。bot.ts の素直なボット（雑魚から離れ、お客に寄り、お店へ向かう）で種を変えて走らせる。
 * ボットは完璧に逃げ回るので人より上手い —— ここでの「余裕」は人にとっての「ちょうどいい」くらい。
 * 数値を変えてここが落ちたら、意図した難しさの変化かを確かめてから閾値を見直す。
 */
function summarize(stage: number, runs = 20) {
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
    expect(summarize(1).maxTime).toBeLessThanOrEqual(freshData().street.duration_seconds);
  });

  it('立ち止まっていると囲まれてやられる（動く意味がある）', () => {
    const outcomes = Array.from({ length: 10 }, (_, i) => playStreet(freshData(), 1, 2000 + i, true));
    expect(outcomes.filter((o) => o.kind === 'down').length).toBeGreaterThanOrEqual(7);
  });
});
