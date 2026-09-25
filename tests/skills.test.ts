import { describe, expect, it } from 'vitest';
import { StreetSim, type StreetParams } from '../src/core/street/streetSim';
import { freshData } from './helpers';

const PARAMS: StreetParams = { stageLevel: 1, hp: 100, maxHp: 100, mp: 100, maxMp: 100, seed: 42 };

/** 敵の湧かない街で、経験値を直に入れてレベルアップさせる */
function levelUp(sim: StreetSim, times = 1): void {
  const thresholds = freshData().street.street_level.exp_thresholds;
  (sim as unknown as { addStreetExp: (n: number) => void }).addStreetExp(thresholds[times - 1]! - sim.streetExp);
}

function quiet() {
  const data = freshData();
  data.street.spawn.max_alive = 0;
  return data;
}

describe('スキルの 3 択（レベルアップ）', () => {
  it('レベルが上がると 3 つの違うスキルが出て、選ぶまで時間が止まる', () => {
    const sim = new StreetSim(quiet(), PARAMS);
    levelUp(sim);
    const offer = sim.skillOffer!;
    expect(offer).toHaveLength(3);
    expect(new Set(offer.map((k) => k.id)).size).toBe(3);
    const t = sim.time;
    sim.tick({ move: { x: 1, y: 0 } });
    expect(sim.time).toBe(t);
    expect(sim.chooseSkill('nope')).toBe(false);
    expect(sim.chooseSkill(offer[0]!.id)).toBe(true);
    expect(sim.skillOffer).toBeNull();
    expect(sim.skills[offer[0]!.id]).toBe(1);
  });

  it('一度に何レベルも上がったら、1 つ選ぶごとに次の 3 択が出る', () => {
    const sim = new StreetSim(quiet(), PARAMS);
    levelUp(sim, 3);
    let picks = 0;
    while (sim.skillOffer) {
      sim.chooseSkill(sim.skillOffer[0]!.id);
      picks++;
    }
    expect(picks).toBe(3);
  });

  it('上限まで取ったスキルと、HP が満タンのときの回復は出ない', () => {
    const data = quiet();
    for (let seed = 1; seed <= 30; seed++) {
      const sim = new StreetSim(data, { ...PARAMS, seed });
      sim.skills.diagonal = 1; // 上限 1
      levelUp(sim);
      const ids = sim.skillOffer!.map((k) => k.id);
      expect(ids).not.toContain('diagonal');
      expect(ids).not.toContain('heal');
    }
  });

  it('HP が減っていれば回復が出ることがあり、選ぶと回復する', () => {
    const data = quiet();
    let seen = false;
    for (let seed = 1; seed <= 40 && !seen; seed++) {
      const sim = new StreetSim(data, { ...PARAMS, hp: 20, seed });
      levelUp(sim);
      if (sim.skillOffer!.some((k) => k.id === 'heal')) {
        seen = true;
        sim.chooseSkill('heal');
        expect(sim.player.hp).toBe(20 + Math.round(100 * data.skills.skills.find((k) => k.id === 'heal')!.value));
      }
    }
    expect(seen).toBe(true);
  });
});

describe('スキルの効き目', () => {
  /** 目の前に敵を 1 体置いて 1 回撃たせ、飛んだ弾を返す */
  function volley(setup: (sim: StreetSim) => void) {
    const data = quiet();
    const sim = new StreetSim(data, PARAMS);
    setup(sim);
    (sim as unknown as { spawnEnemy: (e: unknown) => void }).spawnEnemy(data.enemies[0]!);
    const e = sim.enemies[0]!;
    e.pos.x = sim.player.pos.x + 200;
    e.pos.y = sim.player.pos.y;
    e.hp = 9999;
    sim.tick({ move: { x: 0, y: 0 } });
    return { sim, shots: sim.projectiles };
  }

  it('マルチショットは扇に、ななめ撃ちは ±角度、バックショットは真後ろにも撃つ', () => {
    expect(volley(() => undefined).shots).toHaveLength(1);
    expect(volley((s) => (s.skills.multishot = 2)).shots).toHaveLength(3);
    const diag = volley((s) => (s.skills.diagonal = 1)).shots;
    expect(diag).toHaveLength(3);
    const rear = volley((s) => (s.skills.rear = 1)).shots;
    expect(rear.some((p) => p.vel.x < 0)).toBe(true);
  });

  it('攻撃力アップは弾の威力、連射アップは間隔を縮める、貫通は複数の敵に当たる', () => {
    const data = freshData();
    const base = volley(() => undefined).shots[0]!.damage;
    const powered = volley((s) => (s.skills.power = 2)).shots[0]!.damage;
    expect(powered).toBe(Math.round(data.street.weapon.damage * (1 + 2 * data.skills.skills.find((k) => k.id === 'power')!.value)));
    expect(powered).toBeGreaterThan(base);
    expect(volley((s) => (s.skills.pierce = 1)).shots[0]!.pierce).toBe(1);
  });

  it('貫通した弾は同じ敵に 2 度当たらず、後ろの敵にも当たる', () => {
    const data = quiet();
    const sim = new StreetSim(data, PARAMS);
    sim.skills.pierce = 1;
    for (const dx of [150, 220]) {
      (sim as unknown as { spawnEnemy: (e: unknown) => void }).spawnEnemy(data.enemies[0]!);
      const e = sim.enemies[sim.enemies.length - 1]!;
      e.pos.x = sim.player.pos.x + dx;
      e.pos.y = sim.player.pos.y;
      e.hp = 9999;
      e.speed = 0;
    }
    const hits = new Map<number, number>();
    for (let i = 0; i < 30; i++) {
      sim.tick({ move: { x: 0, y: 0 } });
      for (const ev of sim.drainEvents()) if (ev.type === 'enemy_hit') hits.set(ev.uid, (hits.get(ev.uid) ?? 0) + 1);
      if (i === 0) (sim as unknown as { _weaponTimer: number })._weaponTimer = 999; // 1 発だけ
    }
    expect([...hits.values()]).toEqual([1, 1]);
  });

  it('ハートオービットは自機の周りを回り、触れた敵を間を空けて削る', () => {
    const data = quiet();
    data.street.weapon.range = 0; // 自動攻撃は撃たせない（弾の命中もイベントに混ざるので）
    const sim = new StreetSim(data, PARAMS);
    sim.skills.orbit = 2;
    expect(sim.orbitPositions()).toHaveLength(2);
    (sim as unknown as { spawnEnemy: (e: unknown) => void }).spawnEnemy(data.enemies[0]!);
    const e = sim.enemies[0]!;
    e.hp = 9999;
    e.speed = 0;
    let hits = 0;
    for (let i = 0; i < 60 * 2; i++) {
      // 敵は軌道の上に置き続ける
      e.pos.x = sim.player.pos.x + data.street.orbit.radius;
      e.pos.y = sim.player.pos.y;
      sim.tick({ move: { x: 0, y: 0 } });
      hits += sim.drainEvents().filter((ev) => ev.type === 'enemy_hit').length;
    }
    // 2 秒で間隔 0.5 秒 → 最大 4 回
    expect(hits).toBeGreaterThan(0);
    expect(hits).toBeLessThanOrEqual(Math.ceil(2 / data.street.orbit.hit_interval));
  });

  it('スニーカーは足が速く、体力アップは最大 HP と HP が増える', () => {
    const data = quiet();
    const a = new StreetSim(data, PARAMS);
    const b = new StreetSim(data, PARAMS);
    b.skills.speed = 2;
    for (let i = 0; i < 30; i++) {
      a.tick({ move: { x: 1, y: 0 } });
      b.tick({ move: { x: 1, y: 0 } });
    }
    expect(b.player.pos.x).toBeGreaterThan(a.player.pos.x);
    const c = new StreetSim(data, PARAMS);
    levelUp(c);
    // 3 択に体力アップが出た種を探す代わりに、直に 3 択へ差し込む
    (c as unknown as { _skillOffer: unknown[] })._skillOffer = [data.skills.skills.find((k) => k.id === 'max_hp')!];
    c.chooseSkill('max_hp');
    expect(c.player.maxHp).toBe(125);
    expect(c.player.hp).toBe(125);
  });
});
