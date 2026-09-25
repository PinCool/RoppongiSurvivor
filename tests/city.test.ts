import { describe, expect, it } from 'vitest';
import { blockedAt, distanceToRect, generateCity, resolveCircle } from '../src/core/street/city';
import { NavGrid } from '../src/core/street/nav';
import { StreetSim } from '../src/core/street/streetSim';
import { freshData } from './helpers';

describe('集客の街', () => {
  const data = freshData();

  it('同じ種なら同じ街、違う種なら違う街', () => {
    const a = generateCity(data.street, 1);
    const b = generateCity(data.street, 1);
    const c = generateCity(data.street, 2);
    expect(a.buildings).toEqual(b.buildings);
    expect(a.buildings.map((x) => x.id + x.x0)).not.toEqual(c.buildings.map((x) => x.id + x.x0));
  });

  it('建物は道に掛からず、ワールドの中に収まり、開始地点の周りは空いている', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const city = generateCity(data.street, seed);
      expect(city.buildings.length).toBeGreaterThan(20);
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
    const city = generateCity(data.street, 3);
    const b = city.buildings[0]!;
    const inside = { x: b.x0 + 5, y: (b.y0 + b.y1) / 2 };
    resolveCircle(city, inside, 20);
    expect(blockedAt(city, inside, 19.9)).toBe(false);
    const touching = { x: b.x0 - 10, y: (b.y0 + b.y1) / 2 };
    resolveCircle(city, touching, 20);
    expect(touching.x).toBeCloseTo(b.x0 - 20, 5);
  });

  it('経路は区画をぐるりと回り込んで、反対側の道に届く', () => {
    const city = generateCity(data.street, 4);
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
      sim.tick({ move: { x: Math.cos(i / 90), y: Math.sin(i / 70) } });
      if (sim.outcome) break;
    }
    expect(blockedAt(sim.city, sim.player.pos, sim.player.radius - 0.5)).toBe(false);
    for (const e of sim.enemies) expect(blockedAt(sim.city, e.pos, e.radius - 0.5)).toBe(false);
    for (const c of sim.customers) expect(blockedAt(sim.city, c.pos, 19.5)).toBe(false);
    if (sim.goal) expect(blockedAt(sim.city, sim.goal, data.street.goal_radius - 1)).toBe(false);
  });
});
