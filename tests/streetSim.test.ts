import { describe, expect, it } from 'vitest';
import type { GameData } from '../src/core/data/types';
import { FIXED_DT, StreetSim, type StreetParams } from '../src/core/street/streetSim';
import { freshData } from './helpers';

const STILL = { move: { x: 0, y: 0 } };
const PARAMS: StreetParams = { stageLevel: 1, hp: 100, maxHp: 100, mp: 100, maxMp: 100, seed: 123 };

/** 雑魚が湧かない街（時刻とお客の段取りだけを見る） */
function quietData(): GameData {
  const data = freshData();
  data.street.spawn.max_alive = 0;
  return data;
}

function runUntil(sim: StreetSim, seconds: number, input = STILL): void {
  const ticks = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < ticks && !sim.paused; i++) sim.tick(input);
}

/** 遭遇で止まったら skip してでも時間を進める */
function runThrough(sim: StreetSim, seconds: number): void {
  const end = sim.time + seconds;
  while (sim.time < end - 1e-9 && !sim.outcome) {
    if (sim.pendingEncounter) sim.resolveEncounter('skip');
    sim.tick(STILL);
  }
}

function meetFirstCustomer(sim: StreetSim): void {
  runUntil(sim, 60.05);
  const customer = sim.customers[0]!;
  sim.player.pos.x = customer.pos.x;
  sim.player.pos.y = customer.pos.y;
  sim.tick(STILL);
  expect(sim.pendingEncounter?.uid).toBe(customer.uid);
}

describe('集客パートの段取り', () => {
  it('お客は 60 / 90 / 120 秒に 1 人ずつ、ゴールは 120 秒に出る', () => {
    const sim = new StreetSim(quietData(), PARAMS);
    runThrough(sim, 59.9);
    expect(sim.customers).toHaveLength(0);
    runThrough(sim, 0.2);
    expect(sim.customers).toHaveLength(1);
    runThrough(sim, 30);
    expect(sim.customers).toHaveLength(2);
    expect(sim.goal).toBeNull();
    runThrough(sim, 30);
    expect(sim.customers).toHaveLength(3);
    expect(sim.goal).not.toBeNull();
  });

  it('ゴールはプレイヤーから goal_distance ほど離れた所に出る', () => {
    const data = quietData();
    const sim = new StreetSim(data, PARAMS);
    runThrough(sim, 120.1);
    const g = sim.goal!;
    expect(Math.hypot(g.x, g.y)).toBeCloseTo(data.street.goal_distance, 0);
  });

  it('ゴールに着けば出勤成功、連れているお客を持っていく', () => {
    const sim = new StreetSim(quietData(), PARAMS);
    meetFirstCustomer(sim);
    expect(sim.resolveEncounter('companion')).toBe(true);
    runThrough(sim, 61);
    const goal = sim.goal!;
    sim.player.pos.x = goal.x;
    sim.player.pos.y = goal.y;
    runThrough(sim, 0.1);
    expect(sim.outcome?.kind).toBe('goal');
    expect(sim.outcome?.companions).toHaveLength(1);
  });

  it('制限時間を過ぎると遅刻', () => {
    const data = quietData();
    const sim = new StreetSim(data, PARAMS);
    runThrough(sim, data.street.duration_seconds + 1);
    expect(sim.outcome?.kind).toBe('late');
    expect(sim.timeLeft).toBe(0);
  });

  it('同じ種なら同じ展開（決定論）', () => {
    const a = new StreetSim(freshData(), PARAMS);
    const b = new StreetSim(freshData(), PARAMS);
    const input = { move: { x: 0.6, y: -0.3 } };
    for (let i = 0; i < 60 * 40; i++) {
      a.tick(input);
      b.tick(input);
    }
    expect(a.player.pos).toEqual(b.player.pos);
    expect(a.enemies.map((e) => e.pos)).toEqual(b.enemies.map((e) => e.pos));
    expect(a.kills).toBe(b.kills);
  });

  it('update は実時間を固定ステップに刻む', () => {
    const sim = new StreetSim(quietData(), PARAMS);
    for (let i = 0; i < 30; i++) sim.update(1 / 30, STILL);
    expect(sim.time).toBeCloseTo(1, 1);
  });
});

describe('お客との遭遇（3 択）', () => {
  it('近づくと一時停止し、時間が止まる', () => {
    const sim = new StreetSim(quietData(), PARAMS);
    meetFirstCustomer(sim);
    const t = sim.time;
    sim.update(1, STILL);
    sim.tick(STILL);
    expect(sim.time).toBe(t);
  });

  it('同伴は客ごとの MP を使い、連れ歩きに加わる', () => {
    const data = quietData();
    const sim = new StreetSim(data, PARAMS);
    meetFirstCustomer(sim);
    const customer = sim.pendingEncounter!;
    const cost = data.customers.find((c) => c.id === customer.typeId)!.companion_mp_cost;
    sim.resolveEncounter('companion');
    expect(sim.player.mp).toBe(100 - cost);
    expect(sim.companions).toEqual([{ typeId: customer.typeId, wallet: customer.wallet }]);
    expect(customer.state).toBe('recruited');
    expect(sim.paused).toBe(false);
  });

  it('経験値をもらう / 回復してもらうは少量の MP で、お客は去る', () => {
    const data = quietData();
    const sim = new StreetSim(data, { ...PARAMS, hp: 20 });
    meetFirstCustomer(sim);
    const customer = sim.pendingEncounter!;
    sim.resolveEncounter('heal');
    expect(sim.player.hp).toBe(20 + data.recruit.heal.hp);
    expect(sim.player.mp).toBe(100 - data.recruit.heal.mp_cost);
    expect(customer.state).toBe('dismissed');

    const sim2 = new StreetSim(data, PARAMS);
    meetFirstCustomer(sim2);
    sim2.resolveEncounter('exp');
    expect(sim2.streetExp).toBe(data.recruit.exp.street_exp);
  });

  it('MP が足りない選択肢は選べない', () => {
    const sim = new StreetSim(quietData(), { ...PARAMS, mp: 3 });
    meetFirstCustomer(sim);
    expect(sim.choiceOptions().every((o) => o.block === 'mp')).toBe(true);
    expect(sim.resolveEncounter('companion')).toBe(false);
    expect(sim.paused).toBe(true);
    sim.refillMp();
    expect(sim.resolveEncounter('companion')).toBe(true);
  });

  it('連れ歩きが上限なら同伴は選べない', () => {
    const data = quietData();
    data.street.max_companions = 1;
    const sim = new StreetSim(data, PARAMS);
    meetFirstCustomer(sim);
    sim.resolveEncounter('companion');
    runThrough(sim, 0); // no-op
    runUntil(sim, 30.1);
    const second = sim.customers[1]!;
    sim.player.pos.x = second.pos.x;
    sim.player.pos.y = second.pos.y;
    sim.tick(STILL);
    expect(sim.choiceOptions().find((o) => o.choice === 'companion')?.block).toBe('full');
  });

  it('見送ったお客はしばらく話しかけてこない', () => {
    const data = quietData();
    const sim = new StreetSim(data, PARAMS);
    meetFirstCustomer(sim);
    const customer = sim.pendingEncounter!;
    sim.resolveEncounter('skip');
    for (let i = 0; i < 30; i++) {
      sim.player.pos.x = customer.pos.x;
      sim.player.pos.y = customer.pos.y;
      sim.tick(STILL);
    }
    expect(sim.pendingEncounter).toBeNull();
    runUntil(sim, data.street.customer_skip_cooldown_seconds + 0.5, STILL);
    sim.player.pos.x = customer.pos.x;
    sim.player.pos.y = customer.pos.y;
    sim.tick(STILL);
    expect(sim.pendingEncounter?.uid).toBe(customer.uid);
  });
});

describe('戦闘', () => {
  it('自動攻撃で雑魚を倒し、粒を拾って経験値とレベルが上がる', () => {
    const sim = new StreetSim(freshData(), PARAMS);
    let collected = 0;
    let levelUps = 0;
    for (let i = 0; i < 60 * 45 && !sim.outcome; i++) {
      if (sim.pendingEncounter) sim.resolveEncounter('skip');
      sim.tick(STILL);
      for (const e of sim.drainEvents()) {
        if (e.type === 'gem_collected') collected += e.value;
        if (e.type === 'street_level_up') levelUps++;
      }
    }
    expect(sim.kills).toBeGreaterThan(10);
    expect(collected).toBe(sim.streetExp);
    expect(levelUps).toBe(sim.streetLevel - 1);
    expect(sim.streetLevel).toBeGreaterThan(1);
  });

  it('接触ダメージの後は無敵時間があり、HP が尽きると途中帰宅（同伴は失う）', () => {
    const data = freshData();
    data.street.weapon.damage = 0;
    data.street.street_level.damage_per_level = 0;
    const sim = new StreetSim(data, { ...PARAMS, hp: 30 });
    let hurts = 0;
    let lastHurtAt = -Infinity;
    for (let i = 0; i < 60 * 170 && !sim.outcome; i++) {
      if (sim.pendingEncounter) sim.resolveEncounter('skip');
      sim.tick(STILL);
      for (const e of sim.drainEvents()) {
        if (e.type === 'player_hurt') {
          expect(sim.time - lastHurtAt).toBeGreaterThanOrEqual(data.street.player.invincible_seconds - 1e-6);
          lastHurtAt = sim.time;
          hurts++;
        }
      }
    }
    expect(hurts).toBeGreaterThan(0);
    expect(sim.outcome?.kind).toBe('down');
    expect(sim.outcome?.companions).toEqual([]);
    expect(sim.player.hp).toBe(0);
  });

  it('ステージが上がると雑魚が硬くなる', () => {
    const data = freshData();
    const low = new StreetSim(data, PARAMS);
    const high = new StreetSim(data, { ...PARAMS, stageLevel: 11 });
    runUntil(low, 3);
    runUntil(high, 3);
    const lowHp = low.enemies.find((e) => e.typeId === 'salaryman')!.maxHp;
    const highHp = high.enemies.find((e) => e.typeId === 'salaryman')!.maxHp;
    expect(highHp).toBeGreaterThan(lowHp);
  });

  it('ステージが低いと上客は出ない', () => {
    const data = quietData();
    for (let seed = 1; seed <= 20; seed++) {
      const sim = new StreetSim(data, { ...PARAMS, seed });
      runThrough(sim, 121);
      for (const c of sim.customers) {
        expect(data.customers.find((d) => d.id === c.typeId)!.min_stage).toBeLessThanOrEqual(1);
      }
    }
  });
});
