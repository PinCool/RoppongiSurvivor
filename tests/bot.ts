import type { GameData } from '../src/core/data/types';
import { StreetSim, type StreetOutcome } from '../src/core/street/streetSim';
import { normalize, type Vec2 } from '../src/core/vec';

/**
 * 素直に遊ぶボット。雑魚からは離れ、お客が出たら寄って同伴に誘い、お店が出たら向かう。
 * 同伴が埋まっているか MP が無ければ、HP が減っていれば回復、そうでなければ経験値。
 */
export function playStreet(data: GameData, stageLevel: number, seed: number, still = false): StreetOutcome {
  return playStreetSim(data, stageLevel, seed, still).outcome!;
}

/** ボットで最後まで遊んだシミュレーションを返す（ライバルの横取り数なども見られる） */
export function playStreetSim(data: GameData, stageLevel: number, seed: number, still = false, onTick?: (sim: StreetSim) => void): StreetSim {
  const rival = data.rivals.find((r) => r.gate_stage === stageLevel) ?? null;
  const sim = new StreetSim(data, { stageLevel, hp: 100, maxHp: 100, mp: 100, maxMp: 100, seed, rival });
  let guard = 0;
  while (!sim.outcome && guard++ < 60 * 400) {
    if (sim.skillOffer) {
      sim.chooseSkill(pickSkill(sim));
      continue;
    }
    if (sim.pendingEncounter) {
      const options = sim.choiceOptions();
      const ok = (c: string) => options.find((o) => o.choice === c)?.block === null;
      if (ok('companion')) sim.resolveEncounter('companion');
      else if (sim.player.hp < sim.player.maxHp * 0.6 && ok('heal')) sim.resolveEncounter('heal');
      else if (ok('exp')) sim.resolveEncounter('exp');
      else sim.resolveEncounter('skip');
      continue;
    }
    sim.tick({ move: still ? { x: 0, y: 0 } : steer(sim) });
    onTick?.(sim);
  }
  return sim;
}

function steer(sim: StreetSim): Vec2 {
  const me = sim.player.pos;
  let target: Vec2 | null = null;
  // いちばん近いお客へ（ライバルと取り合いになるので、遠い方から狙わない）
  const wanderer = sim.customers
    .filter((c) => c.state === 'wandering' && c.skipCooldown <= 0)
    .sort((a, b) => Math.hypot(a.pos.x - me.x, a.pos.y - me.y) - Math.hypot(b.pos.x - me.x, b.pos.y - me.y))[0];
  if (wanderer && sim.companions.length < 3) target = wanderer.pos;
  else if (sim.goal) target = sim.goal;
  let dx = 0;
  let dy = 0;
  if (target) {
    // 建物を回り込む向き（人は画面を見て道なりに動く）
    const d = sim.navigate(me, target);
    dx += d.x;
    dy += d.y;
  }
  for (const e of sim.enemies) {
    const ox = me.x - e.pos.x;
    const oy = me.y - e.pos.y;
    const dist = Math.hypot(ox, oy);
    if (dist < 160 && dist > 0) {
      const w = (160 - dist) / 160;
      dx += (ox / dist) * w * 1.6;
      dy += (oy / dist) * w * 1.6;
    }
  }
  if (!target && dx === 0 && dy === 0) return { x: Math.cos(sim.time * 0.5), y: Math.sin(sim.time * 0.5) };
  return normalize({ x: dx, y: dy });
}

/** ボットのスキルの選び方: 火力 → 範囲 → 守り の順。回復は HP が 6 割を切っていれば最優先 */
const SKILL_PRIORITY = ['multishot', 'power', 'rapid', 'orbit', 'pierce', 'diagonal', 'max_hp', 'speed', 'magnet', 'rear', 'heal'];
function pickSkill(sim: StreetSim): string {
  const offer = sim.skillOffer!;
  if (sim.player.hp < sim.player.maxHp * 0.6) {
    const heal = offer.find((k) => k.kind === 'heal');
    if (heal) return heal.id;
  }
  return [...offer].sort((a, b) => SKILL_PRIORITY.indexOf(a.kind) - SKILL_PRIORITY.indexOf(b.kind))[0]!.id;
}
