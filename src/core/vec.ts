/** Core の 2D ベクトル。画面座標と同じく x 右・y 下。 */
export interface Vec2 {
  x: number;
  y: number;
}

export const vec = (x: number, y: number): Vec2 => ({ x, y });

export function lengthOf(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

export function distanceSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.sqrt(distanceSq(a, b));
}

/** 長さ 1 に。ゼロベクトルはゼロのまま */
export function normalize(v: Vec2): Vec2 {
  const len = lengthOf(v);
  return len > 1e-9 ? { x: v.x / len, y: v.y / len } : { x: 0, y: 0 };
}

/** 長さが 1 を超えるときだけ 1 に縮める（スティック入力用） */
export function clampLength1(v: Vec2): Vec2 {
  const len = lengthOf(v);
  return len > 1 ? { x: v.x / len, y: v.y / len } : { x: v.x, y: v.y };
}

export function circlesOverlap(a: Vec2, ra: number, b: Vec2, rb: number): boolean {
  const r = ra + rb;
  return distanceSq(a, b) <= r * r;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
