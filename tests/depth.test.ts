import { describe, expect, it } from 'vitest';
import { DEPTH, characterDepth } from '../src/game/depth';
import { freshData } from './helpers';

describe('集客画面の重なり順', () => {
  const half = freshData().street.world_half_size;

  it('ワールドのどこにいても、キャラは地面・足元の印より手前、弾と HUD より奥', () => {
    for (const y of [-half, -356, -11, 0, half]) {
      const d = characterDepth(y);
      expect(d).toBeGreaterThan(DEPTH.ground);
      expect(d).toBeGreaterThan(DEPTH.worldEdge);
      expect(d).toBeGreaterThan(DEPTH.footMarks);
      expect(d).toBeLessThan(DEPTH.shots);
      expect(d).toBeLessThan(DEPTH.hud);
    }
  });

  it('層どうしの順番', () => {
    expect(DEPTH.ground).toBeLessThan(DEPTH.worldEdge);
    expect(DEPTH.worldEdge).toBeLessThan(DEPTH.footMarks);
    expect(DEPTH.shots).toBeLessThan(DEPTH.offscreenArrows);
    expect(DEPTH.offscreenArrows).toBeLessThan(DEPTH.hud);
  });
});
