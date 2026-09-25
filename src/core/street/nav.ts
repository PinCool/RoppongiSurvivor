import type { Vec2 } from '../vec';
import { blockedAt, type City } from './city';

/**
 * 回り込みの経路。地面を cell 角のマスに分け、目的地から各マスまでの道のり（8 方向・壁の角は切らない）を幅優先で求める。
 * 敵はこれを下って自機へ向かう（まっすぐ向かうと建物の壁に張り付いて止まる）。
 */
export class NavGrid {
  readonly size: number;
  private readonly _walkable: Uint8Array;
  private readonly _cell: number;
  private readonly _half: number;
  private readonly _queue: Int32Array;

  constructor(city: City, cell: number, agentRadius: number) {
    this._cell = cell;
    this._half = city.half;
    this.size = Math.ceil((city.half * 2) / cell);
    this._walkable = new Uint8Array(this.size * this.size);
    this._queue = new Int32Array(this.size * this.size);
    for (let j = 0; j < this.size; j++) {
      for (let i = 0; i < this.size; i++) {
        this._walkable[j * this.size + i] = blockedAt(city, this.center(i, j), agentRadius) ? 0 : 1;
      }
    }
  }

  center(i: number, j: number): Vec2 {
    return { x: -this._half + (i + 0.5) * this._cell, y: -this._half + (j + 0.5) * this._cell };
  }

  cellOf(p: Vec2): [number, number] {
    const clamp = (v: number) => Math.min(this.size - 1, Math.max(0, v));
    return [clamp(Math.floor((p.x + this._half) / this._cell)), clamp(Math.floor((p.y + this._half) / this._cell))];
  }

  walkable(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < this.size && j < this.size && this._walkable[j * this.size + i] === 1;
  }

  /** target までの道のり（8 方向の歩数。壁の角は切らない）。届かないマスは -1 */
  flowTo(target: Vec2): Int32Array {
    const n = this.size;
    const dist = new Int32Array(n * n).fill(-1);
    let [ti, tj] = this.cellOf(target);
    if (!this.walkable(ti, tj)) [ti, tj] = this.nearestWalkable(ti, tj);
    // 平らな配列の待ち行列で幅優先（1 回 0.2ms 程度。敵が毎フレーム引くので速さが要る）
    const queue = this._queue;
    let head = 0;
    let tail = 0;
    const start = tj * n + ti;
    dist[start] = 0;
    queue[tail++] = start;
    const walk = this._walkable;
    while (head < tail) {
      const idx = queue[head++]!;
      const i = idx % n;
      const j = (idx - i) / n;
      const next = dist[idx]! + 1;
      const left = i > 0 && walk[idx - 1] === 1;
      const right = i < n - 1 && walk[idx + 1] === 1;
      const up = j > 0 && walk[idx - n] === 1;
      const down = j < n - 1 && walk[idx + n] === 1;
      // 縦横
      if (left && dist[idx - 1] === -1) { dist[idx - 1] = next; queue[tail++] = idx - 1; }
      if (right && dist[idx + 1] === -1) { dist[idx + 1] = next; queue[tail++] = idx + 1; }
      if (up && dist[idx - n] === -1) { dist[idx - n] = next; queue[tail++] = idx - n; }
      if (down && dist[idx + n] === -1) { dist[idx + n] = next; queue[tail++] = idx + n; }
      // 斜め（両隣が通れるときだけ。壁の角を切らない）
      if (left && up && walk[idx - n - 1] === 1 && dist[idx - n - 1] === -1) { dist[idx - n - 1] = next; queue[tail++] = idx - n - 1; }
      if (right && up && walk[idx - n + 1] === 1 && dist[idx - n + 1] === -1) { dist[idx - n + 1] = next; queue[tail++] = idx - n + 1; }
      if (left && down && walk[idx + n - 1] === 1 && dist[idx + n - 1] === -1) { dist[idx + n - 1] = next; queue[tail++] = idx + n - 1; }
      if (right && down && walk[idx + n + 1] === 1 && dist[idx + n + 1] === -1) { dist[idx + n + 1] = next; queue[tail++] = idx + n + 1; }
    }
    return dist;
  }

  /**
   * 流れ場を 1 歩下る向き（長さ 1）。null なら「まっすぐ向かえ」の合図:
   * 目的地のマス（道のり 0）に着いたとき —— 目的地そのものが歩けないマス（自機がすり抜けられる狭い隙間など）でも、
   * 最寄りの歩けるマスで止まらず、そこから先は壁沿いに滑ってまっすぐ入っていく（止まると隙間が安全地帯になった）
   */
  direction(field: Int32Array, from: Vec2): Vec2 | null {
    const n = this.size;
    const [i, j] = this.cellOf(from);
    if (field[j * n + i] === 0) return null;
    let best = field[j * n + i]!;
    let bi = -1;
    let bj = -1;
    for (const [di, dj] of STEPS) {
      const ni = i + di;
      const nj = j + dj;
      if (!this.walkable(ni, nj)) continue;
      if (di !== 0 && dj !== 0 && (!this.walkable(i + di, j) || !this.walkable(i, j + dj))) continue;
      const d = field[nj * n + ni]!;
      if (d >= 0 && (best < 0 || d < best)) {
        best = d;
        bi = ni;
        bj = nj;
      }
    }
    if (bi < 0) {
      // 歩けないマス（建物の脇の狭い隙間など）に立っていて下れる隣が無い: 近くの「届くマス」へ出る
      const escape = this.nearestReachable(field, i, j, 4);
      if (!escape) return null;
      [bi, bj] = escape;
    }
    const c = this.center(bi, bj);
    const dx = c.x - from.x;
    const dy = c.y - from.y;
    const len = Math.hypot(dx, dy);
    return len > 1e-9 ? { x: dx / len, y: dy / len } : null;
  }

  private nearestReachable(field: Int32Array, i: number, j: number, maxR: number): [number, number] | null {
    const n = this.size;
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let r = 1; r <= maxR && !best; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const ni = i + di;
          const nj = j + dj;
          if (!this.walkable(ni, nj)) continue;
          const d = field[nj * n + ni]!;
          if (d >= 0 && d < bestD) {
            bestD = d;
            best = [ni, nj];
          }
        }
      }
    }
    return best;
  }

  private nearestWalkable(i: number, j: number): [number, number] {
    for (let r = 1; r < this.size; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) === r && this.walkable(i + di, j + dj)) return [i + di, j + dj];
        }
      }
    }
    return [i, j];
  }
}

const STEPS: readonly [number, number, number][] = [
  [1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10],
  [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14],
];
