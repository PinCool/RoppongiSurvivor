import { describe, expect, it } from 'vitest';
import { blockedAt, distanceToRect, generateCity, resolveCircle } from '../src/core/street/city';
import { NavGrid } from '../src/core/street/nav';
import { StreetSim } from '../src/core/street/streetSim';
import { freshData } from './helpers';

describe('集客の街', () => {
  const data = freshData();

  it('同じ種なら同じ街、違う種なら違う街', () => {
    const a = generateCity(data.street, data.buildings, 1);
    const b = generateCity(data.street, data.buildings, 1);
    const c = generateCity(data.street, data.buildings, 2);
    expect(a.buildings).toEqual(b.buildings);
    expect(a.buildings.map((x) => x.kindId + x.x0)).not.toEqual(c.buildings.map((x) => x.kindId + x.x0));
  });

  it('建物は道に掛からず、ワールドの中に収まり、開始地点の周りは空いている', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const city = generateCity(data.street, data.buildings, seed);
      expect(city.buildings.length).toBeGreaterThan(20);
      expect(city.buildings.some((b) => data.buildings.find((k) => k.id === b.kindId)!.landmark)).toBe(true);
      for (const b of city.buildings) {
        expect(b.x0).toBeGreaterThanOrEqual(-city.half);
        expect(b.x1).toBeLessThanOrEqual(city.half);
        expect(distanceToRect({ x: 0, y: 0 }, b)).toBeGreaterThanOrEqual(data.street.city.spawn_clear_radius);
        // 道の芯線（pitch の倍数）から道の半幅より内側には無い
        for (const edge of [b.x0, b.x1]) {
          const offset = Math.abs(edge - Math.round(edge / city.pitch) * city.pitch);
          expect(offset).toBeGreaterThanOrEqual(city.roadHalf);
        }
      }
    }
  });

  it('円は建物の外へ押し出される（中に入り込んでも最寄りの辺から出る）', () => {
    const city = generateCity(data.street, data.buildings, 3);
    const b = city.buildings[0]!;
    const inside = { x: b.x0 + 5, y: (b.y0 + b.y1) / 2 };
    resolveCircle(city, inside, 20);
    expect(blockedAt(city, inside, 19.9)).toBe(false);
    const touching = { x: b.x0 - 10, y: (b.y0 + b.y1) / 2 };
    resolveCircle(city, touching, 20);
    expect(touching.x).toBeCloseTo(b.x0 - 20, 5);
  });

  it('経路は区画をぐるりと回り込んで、反対側の道に届く', () => {
    const city = generateCity(data.street, data.buildings, 4);
    const nav = new NavGrid(city, data.street.city.nav_cell, 20);
    // 建物のある区画の、左の道から右の道へ（まっすぐは建物で塞がっている）
    const blk = city.blocks.find((b) => !b.plaza && city.buildings.some((x) => x.x0 >= b.x0 && x.x1 <= b.x1 && x.y0 >= b.y0 && x.y1 <= b.y1) && b.x0 > 0 && b.y0 > 0)!;
    const y = (blk.y0 + blk.y1) / 2;
    const target = { x: blk.x0 - city.roadHalf / 2, y };
    const pos = { x: blk.x1 + city.roadHalf / 2, y };
    const field = nav.flowTo(target);
    let steps = 0;
    for (; steps < 1000 && Math.hypot(pos.x - target.x, pos.y - target.y) > 60; steps++) {
      const dir = nav.direction(field, pos);
      expect(dir, `step ${steps}`).not.toBeNull();
      pos.x += dir!.x * 10;
      pos.y += dir!.y * 10;
      resolveCircle(city, pos, 20);
    }
    expect(Math.hypot(pos.x - target.x, pos.y - target.y)).toBeLessThanOrEqual(60);
  });

  it('シミュレーションの中では、誰も建物に食い込まない', () => {
    const sim = new StreetSim(data, { stageLevel: 5, hp: 9999, maxHp: 9999, mp: 100, maxMp: 100, seed: 11 });
    for (let i = 0; i < 60 * 90; i++) {
      if (sim.pendingEncounter) sim.resolveEncounter('skip');
      if (sim.skillOffer) sim.chooseSkill(sim.skillOffer[0]!.id);
      sim.tick({ move: { x: Math.cos(i / 90), y: Math.sin(i / 70) } });
      if (sim.outcome) break;
    }
    expect(blockedAt(sim.city, sim.player.pos, sim.player.radius - 0.5)).toBe(false);
    for (const e of sim.enemies) expect(blockedAt(sim.city, e.pos, e.radius - 0.5)).toBe(false);
    for (const c of sim.customers) expect(blockedAt(sim.city, c.pos, 19.5)).toBe(false);
    if (sim.goal) expect(blockedAt(sim.city, sim.goal, data.street.goal_radius - 1)).toBe(false);
  });
});

describe('路地', () => {
  it('建物どうしの隙間は「くっつく」か「min_alley 以上」のどちらか（挟まる隙間・すり抜けられる隙間を作らない）', () => {
    const data = freshData();
    const minAlley = data.street.city.min_alley;
    for (let seed = 1; seed <= 20; seed++) {
      const city = generateCity(data.street, data.buildings, seed);
      for (const a of city.buildings) {
        for (const b of city.buildings) {
          if (a === b) continue;
          const overlapY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
          const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
          const gapX = b.x0 - a.x1;
          const gapY = b.y0 - a.y1;
          if (overlapY > 0 && gapX > 1e-6) expect(gapX, `seed ${seed} ${a.kindId}|${b.kindId}`).toBeGreaterThanOrEqual(minAlley - 1e-6);
          if (overlapX > 0 && gapY > 1e-6) expect(gapY, `seed ${seed} ${a.kindId}|${b.kindId}`).toBeGreaterThanOrEqual(minAlley - 1e-6);
          expect(overlapX > 1e-6 && overlapY > 1e-6, `重なり seed ${seed}`).toBe(false);
        }
      }
    }
  });

  it('いちばん細い路地に逃げ込んでも、敵は入ってくる（安全地帯を作らない）', () => {
    const data = freshData();
    data.street.spawn.max_alive = 0;
    // 自動攻撃で倒してしまうと届いたか分からないので、弾は当たっても削らない
    data.street.weapon.damage = 0;
    data.street.orbit.damage = 0;
    let found: { sim: StreetSim; spot: { x: number; y: number }; gap: number } | null = null;
    for (let seed = 1; seed < 40; seed++) {
      const sim = new StreetSim(data, { stageLevel: 1, hp: 100, maxHp: 100, mp: 100, maxMp: 100, seed });
      for (const a of sim.city.buildings) {
        for (const b of sim.city.buildings) {
          const gap = b.x0 - a.x1;
          const y0 = Math.max(a.y0, b.y0);
          const y1 = Math.min(a.y1, b.y1);
          if (gap > 0 && gap < 200 && y1 - y0 > 80 && (!found || gap < found.gap)) found = { sim, spot: { x: (a.x1 + b.x0) / 2, y: (y0 + y1) / 2 }, gap };
        }
      }
    }
    expect(found, '路地のある街が見つからない').not.toBeNull();
    const { sim, spot } = found!;
    sim.player.pos.x = spot.x;
    sim.player.pos.y = spot.y;
    (sim as unknown as { spawnEnemy: (e: unknown) => void }).spawnEnemy(data.enemies[0]!);
    const enemy = sim.enemies[0]!;
    enemy.pos.x = spot.x;
    enemy.pos.y = spot.y - 260;
    let reached = false;
    for (let i = 0; i < 60 * 20 && !reached; i++) {
      sim.player.pos.x = spot.x;
      sim.player.pos.y = spot.y;
      sim.tick({ move: { x: 0, y: 0 } });
      if (sim.drainEvents().some((e) => e.type === 'player_hurt')) reached = true;
    }
    expect(reached).toBe(true);
  });
});
