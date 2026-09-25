import type { BuildingKindData, StreetData } from '../data/types';
import { Rng } from '../rng';
import type { Vec2 } from '../vec';

/**
 * 集客の街（架空。遊びやすさ優先）。道は pitch おきの格子で、原点は交差点。
 * 道に囲まれた区画に、正方形の建物を 2×2 まで置く（空き地と広場の区画も混ぜる）。
 * 建物は通れない壁（円と矩形の押し出し）。座標は地面の平面（x, y）で、斜め見下ろしへの写しは描画側の仕事。
 * 2026-09-25 ユーザー指示「六本木の地形データは使用しなくていいです。遊びやすい街を作ってくれれば」
 */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Building extends Rect {
  id: number;
  /** 建物の種類（buildings.json の id）。絵は描画側が種類の visual_id で引く */
  kindId: string;
}

export interface Block extends Rect {
  plaza: boolean;
}

export interface City {
  half: number;
  pitch: number;
  roadHalf: number;
  blocks: Block[];
  buildings: Building[];
  /** 区画ごとの建物（当たりの問い合わせを近所だけにする） */
  byBlock: Map<string, Building[]>;
}

const blockKey = (bx: number, by: number) => `${bx},${by}`;

export function generateCity(cfg: StreetData, kinds: readonly BuildingKindData[], seed: number): City {
  const c = cfg.city;
  const small = kinds.filter((k) => !k.landmark);
  const landmarks = kinds.filter((k) => k.landmark);
  const rng = new Rng(seed ^ 0x51ed270b);
  const half = cfg.world_half_size;
  const pitch = c.pitch;
  const rh = c.road_half_width;
  const blocks: Block[] = [];
  const buildings: Building[] = [];
  const byBlock = new Map<string, Building[]>();
  const n = Math.ceil(half / pitch);
  let id = 0;
  for (let bx = -n; bx < n; bx++) {
    for (let by = -n; by < n; by++) {
      const block = { x0: bx * pitch + rh, y0: by * pitch + rh, x1: (bx + 1) * pitch - rh, y1: (by + 1) * pitch - rh };
      if (block.x0 >= half || block.y0 >= half || block.x1 <= -half || block.y1 <= -half) continue;
      const plaza = rng.chance(c.plaza_block_chance);
      blocks.push({ ...block, plaza });
      if (plaza) continue;
      const list: Building[] = [];
      // 足元を区割り（または区画）の真ん中に置く。ワールドの外にはみ出す建物と、開始地点の近くの建物は置かない
      const make = (kind: BuildingKindData, cx: number, cy: number): Building | null => {
        const b = { id: id++, kindId: kind.id, x0: cx - kind.width / 2, y0: cy - kind.depth / 2, x1: cx + kind.width / 2, y1: cy + kind.depth / 2 };
        if (b.x0 < -half || b.y0 < -half || b.x1 > half || b.y1 > half) return null;
        if (distanceToRect({ x: 0, y: 0 }, b) < c.spawn_clear_radius) return null;
        return b;
      };
      let placed: Building[] = [];
      if (landmarks.length > 0 && rng.chance(c.landmark_block_chance)) {
        const b = make(rng.pick(landmarks), (block.x0 + block.x1) / 2, (block.y0 + block.y1) / 2);
        if (b) placed.push(b);
      } else {
        const lots: (Building | null)[][] = [[null, null], [null, null]];
        for (let lx = 0; lx < 2; lx++) {
          for (let ly = 0; ly < 2; ly++) {
            if (rng.chance(c.empty_lot_chance)) continue;
            const x0 = block.x0 + c.lot_margin + lx * (c.lot_size + c.lot_gap);
            const y0 = block.y0 + c.lot_margin + ly * (c.lot_size + c.lot_gap);
            lots[lx]![ly] = make(rng.pick(small), x0 + c.lot_size / 2, y0 + c.lot_size / 2);
          }
        }
        closeSlivers(lots, c.min_alley);
        placed = dropSlivers(lots.flat().filter((b): b is Building => b !== null), c.min_alley);
      }
      list.push(...placed);
      buildings.push(...placed);
      byBlock.set(blockKey(bx, by), list);
    }
  }
  return { half, pitch, roadHalf: rh, blocks, buildings, byBlock };
}

/**
 * 同じ区画の隣どうし（横並び・縦並び）の隙間が min_alley より狭ければ、寄せてくっつける。
 * 中途半端な隙間は、自機が挟まって動けなくなったり、自機だけ入れて敵が入れない安全地帯になったりした（2026-09-25）
 */
function closeSlivers(lots: (Building | null)[][], minAlley: number): void {
  const shift = (b: Building, dx: number, dy: number) => {
    b.x0 += dx;
    b.x1 += dx;
    b.y0 += dy;
    b.y1 += dy;
  };
  for (let ly = 0; ly < 2; ly++) {
    const a = lots[0]![ly];
    const b = lots[1]![ly];
    if (!a || !b) continue;
    const gap = b.x0 - a.x1;
    if (gap > 0 && gap < minAlley) {
      shift(a, gap / 2, 0);
      shift(b, -gap / 2, 0);
    }
  }
  for (let lx = 0; lx < 2; lx++) {
    const a = lots[lx]![0];
    const b = lots[lx]![1];
    if (!a || !b) continue;
    const gap = b.y0 - a.y1;
    if (gap > 0 && gap < minAlley) {
      shift(a, 0, gap / 2);
      shift(b, 0, -gap / 2);
    }
  }
}

/**
 * 寄せても残った中途半端な隙間と重なり（斜め向かいの建物どうしなど）は、小さい方の建物を置かないことで消す。
 * 隙間は「くっつく（0）」か「min_alley 以上」だけにする
 */
function dropSlivers(list: Building[], minAlley: number): Building[] {
  const area = (b: Building) => (b.x1 - b.x0) * (b.y1 - b.y0);
  const sliver = (a: Building, b: Building) => {
    const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    const overlapY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    const gapX = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1);
    const gapY = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1);
    const overlapping = overlapX > 1e-6 && overlapY > 1e-6; // 縦横両方で寄せたときに斜め向かいが食い込むことがある
    return overlapping || (overlapY > 0 && gapX > 1e-6 && gapX < minAlley) || (overlapX > 0 && gapY > 1e-6 && gapY < minAlley);
  };
  const kept = [...list];
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < kept.length && !changed; i++) {
      for (let j = i + 1; j < kept.length && !changed; j++) {
        if (!sliver(kept[i]!, kept[j]!)) continue;
        kept.splice(area(kept[i]!) < area(kept[j]!) ? i : j, 1);
        changed = true;
      }
    }
  }
  return kept;
}

export function distanceToRect(p: Vec2, r: Rect): number {
  const dx = Math.max(r.x0 - p.x, 0, p.x - r.x1);
  const dy = Math.max(r.y0 - p.y, 0, p.y - r.y1);
  return Math.hypot(dx, dy);
}

/** p の近所（自分の区画と周り 8 区画）の建物。毎ティック大量に呼ばれるので配列を作り直さない */
const scratch: Building[] = [];
export function nearbyBuildings(city: City, p: Vec2): Building[] {
  const bx = Math.floor(p.x / city.pitch);
  const by = Math.floor(p.y / city.pitch);
  scratch.length = 0;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const list = city.byBlock.get(blockKey(bx + dx, by + dy));
      if (list) for (const b of list) scratch.push(b);
    }
  }
  return scratch;
}

/** 半径 r の円が建物に食い込んでいるか（r で余白を足せる） */
export function blockedAt(city: City, p: Vec2, r = 0): boolean {
  for (const b of nearbyBuildings(city, p)) if (distanceToRect(p, b) < r || insideRect(p, b)) return true;
  return false;
}

function insideRect(p: Vec2, b: Rect): boolean {
  return p.x > b.x0 && p.x < b.x1 && p.y > b.y0 && p.y < b.y1;
}

/**
 * 円を建物の外へ押し出す（壁沿いに滑る）。中心が建物の中に入っていたら、いちばん浅い辺から出す。
 * 押し出したら true。
 */
export function resolveCircle(city: City, p: Vec2, r: number): boolean {
  let moved = false;
  for (const b of nearbyBuildings(city, p)) {
    if (insideRect(p, b)) {
      const exits = [p.x - b.x0, b.x1 - p.x, p.y - b.y0, b.y1 - p.y];
      const m = Math.min(...exits);
      if (m === exits[0]) p.x = b.x0 - r;
      else if (m === exits[1]) p.x = b.x1 + r;
      else if (m === exits[2]) p.y = b.y0 - r;
      else p.y = b.y1 + r;
      moved = true;
      continue;
    }
    const cx = Math.min(Math.max(p.x, b.x0), b.x1);
    const cy = Math.min(Math.max(p.y, b.y0), b.y1);
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d = Math.hypot(dx, dy);
    if (d < r && d > 1e-9) {
      p.x = cx + (dx / d) * r;
      p.y = cy + (dy / d) * r;
      moved = true;
    }
  }
  return moved;
}
