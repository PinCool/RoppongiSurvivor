import type { Vec2 } from '../core/vec';

/**
 * 地面（Core の x, y）と画面（斜め見下ろし）の写し。係数は street.json の view（建物の絵の床の菱形に合わせて 0.707 : 0.456）。
 * 画面 x = (x − y) × ax、画面 y = (x + y) × ay。Phaser に依存しない（tests/iso.test.ts）。
 */
export interface IsoView {
  iso_x: number;
  iso_y: number;
}

export function toScreen(v: IsoView, p: Vec2): Vec2 {
  return { x: (p.x - p.y) * v.iso_x, y: (p.x + p.y) * v.iso_y };
}

export function toGround(v: IsoView, s: Vec2): Vec2 {
  const a = s.x / v.iso_x;
  const b = s.y / v.iso_y;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/**
 * スティックの向き（画面）を地面の向きへ。長さ（倒し具合）は保つ。
 * 画面で上に倒したら、画面で上へ動くように（地面の軸に合わせると斜めに進んで気持ち悪い）。
 */
export function stickToGround(v: IsoView, stick: Vec2): Vec2 {
  const len = Math.hypot(stick.x, stick.y);
  if (len < 1e-9) return { x: 0, y: 0 };
  const g = toGround(v, stick);
  const glen = Math.hypot(g.x, g.y);
  return { x: (g.x / glen) * len, y: (g.y / glen) * len };
}
