import type { GameData } from '../data/types';
import { activeRival } from './rival';
import type { ServiceResult } from '../service/serviceSession';
import type { OutcomeKind, StreetOutcome } from '../street/streetSim';
import type { PlayerState } from './playerState';
import { addExp } from './progression';

export interface ShiftReport {
  outcome: OutcomeKind;
  /** 店の売上（遅刻の減額後） */
  sales: number;
  /** 主人公の取り分（所持金に入った額） */
  earned: number;
  exp: number;
  levelsGained: number;
  levelAfter: number;
  stageBefore: number;
  stageAfter: number;
  kills: number;
  drunkGained: number;
  guests: ServiceResult['guests'];
  /** 関門のステージだったときだけ。won ならステージが進み、ライバルを倒したことになる */
  rival: { id: string; target: number; won: boolean } | null;
}

/**
 * 1 回の出勤（集客 → 接客）の結果を主人公へ反映する。
 * 遅刻は売上を減らし、途中帰宅（HP 切れ）は接客そのものが無い。ゴールに着けばステージが 1 上がる。
 * ただし関門のステージでは、ゴールに着いたうえで売上がライバルの目標を越えないとステージは上がらない。
 */
export function applyShift(state: PlayerState, data: GameData, street: StreetOutcome, service: ServiceResult | null): ShiftReport {
  const p = data.player;
  const rawSales = service?.sales ?? 0;
  const sales = street.kind === 'late' ? Math.floor(rawSales * p.late_sales_multiplier) : rawSales;
  const earned = Math.floor(sales * p.back_rate);
  const exp = street.streetExp * p.exp_per_street_exp + Math.floor(sales / 1000) * p.exp_per_1000_sales;
  const drunkGained = service?.drunkGained ?? 0;
  const stageBefore = state.stageLevel;
  const rival = activeRival(state, data);
  const rivalWon = rival !== null && street.kind === 'goal' && sales > rival.sales_target;

  state.hp = street.hp;
  state.mp = service ? service.mpLeft : street.mp;
  state.money += earned;
  state.totalSales += sales;
  state.drunk = Math.min(100, state.drunk + drunkGained);
  state.workedToday = true;
  if (street.kind === 'goal' && (rival === null || rivalWon)) state.stageLevel += 1;
  if (rival && rivalWon) state.defeatedRivals.push(rival.id);
  const levelsGained = addExp(state, exp, p);

  return {
    outcome: street.kind,
    sales,
    earned,
    exp,
    levelsGained,
    levelAfter: state.level,
    stageBefore,
    stageAfter: state.stageLevel,
    kills: street.kills,
    drunkGained,
    guests: service?.guests ?? [],
    rival: rival ? { id: rival.id, target: rival.sales_target, won: rivalWon } : null,
  };
}
