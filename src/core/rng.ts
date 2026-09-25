/**
 * 決定論的な乱数（mulberry32）。同じ seed なら同じ列を返すので、シミュレーションをテストで再現できる。
 * Math.random は Core では使わない。
 */
export class Rng {
  private _state: number;

  constructor(seed: number) {
    this._state = seed >>> 0;
  }

  get state(): number {
    return this._state;
  }

  /** [0, 1) */
  next(): number {
    this._state = (this._state + 0x6d2b79f5) >>> 0;
    let t = this._state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max) */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** [min, max] の整数 */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** weight に比例して 1 つ選ぶ。重みがすべて 0 以下なら例外 */
  weighted<T>(items: readonly T[], weightOf: (item: T) => number): T {
    let total = 0;
    for (const item of items) total += Math.max(0, weightOf(item));
    if (total <= 0) throw new Error('Rng.weighted: no positive weight');
    let roll = this.next() * total;
    for (const item of items) {
      roll -= Math.max(0, weightOf(item));
      if (roll < 0) return item;
    }
    return items[items.length - 1] as T;
  }
}
