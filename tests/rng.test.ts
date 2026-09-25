import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';

describe('Rng', () => {
  it('同じ種なら同じ列', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('next は [0, 1)、int は両端を含む', () => {
    const rng = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      seen.add(rng.int(1, 3));
    }
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('weighted は重みに比例し、重み 0 は選ばない', () => {
    const rng = new Rng(3);
    const counts = { a: 0, b: 0, c: 0 };
    const weights = { a: 3, b: 1, c: 0 };
    for (let i = 0; i < 8000; i++) counts[rng.weighted(['a', 'b', 'c'] as const, (k) => weights[k])]++;
    expect(counts.c).toBe(0);
    expect(counts.a / counts.b).toBeGreaterThan(2.5);
    expect(counts.a / counts.b).toBeLessThan(3.5);
  });
});
