import { describe, expect, it } from 'vitest';
import { stickToGround, toGround, toScreen } from '../src/game/iso';
import { freshData } from './helpers';

describe('斜め見下ろしの写し', () => {
  const v = freshData().street.view;

  it('地面 → 画面 → 地面で元に戻る', () => {
    for (const p of [{ x: 0, y: 0 }, { x: 123, y: -456 }, { x: -2400, y: 2400 }]) {
      const back = toGround(v, toScreen(v, p));
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  });

  it('スティックを画面で上に倒すと、画面で真上へ動き、倒し具合は保たれる', () => {
    const g = stickToGround(v, { x: 0, y: -0.5 });
    expect(Math.hypot(g.x, g.y)).toBeCloseTo(0.5, 6);
    const s = toScreen(v, g);
    expect(s.x).toBeCloseTo(0, 6);
    expect(s.y).toBeLessThan(0);
  });

  it('建物の絵の床の菱形（縦横比 約 0.645）と写しの比率が合っている', () => {
    // 地面の正方形の菱形: 幅 = 2 辺 × ax、高さ = 2 辺 × ay
    expect(v.iso_y / v.iso_x).toBeCloseTo(0.645, 2);
  });
});
