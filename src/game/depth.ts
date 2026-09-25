/**
 * 集客画面の重なり順。キャラは足元の y をそのまま depth にして前後を決める（手前ほど上）。
 * y はワールドの ±world_half_size まで動くので、地面や足元の印はそれより必ず奥、弾や HUD は必ず手前に置く。
 * （2026-09-25: 地面を -10 にしていて、スタート地点より上（y < -10）へ行ったキャラが地面の裏に隠れて消えた）
 */
export const DEPTH = {
  ground: -1_000_000,
  worldEdge: -999_999,
  footMarks: -999_998,
  shots: 500_000,
  offscreenArrows: 600_000,
  hud: 1_000_000,
} as const;

/** キャラ（自機・敵・お客・お店）の depth。足元の y */
export function characterDepth(y: number): number {
  return y;
}
