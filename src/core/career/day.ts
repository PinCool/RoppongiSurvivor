import { byId } from '../data/gameData';
import type { GameData } from '../data/types';
import { crossesMonth } from './calendar';
import type { PlayerState } from './playerState';

export interface DayReport {
  /** 月末の精算が走ったときだけ */
  settlement: { rent: number; moneyAfter: number; inDebt: boolean; debtMonths: number } | null;
  hangover: boolean;
  gameOver: boolean;
}

/**
 * 1 日を終えて翌朝へ進める。寝て回復 → 酔いが抜ける → 月をまたげば家賃を払う。
 * 休み（出勤しなかった日）はよく回復する。二日酔いのしきい値を超えていると回復が落ちる。
 */
export function endDay(state: PlayerState, data: GameData): DayReport {
  const p = data.player;
  const rested = !state.workedToday;
  const hangover = state.drunk >= p.overnight.hangover_threshold;
  const hpRatio = rested ? p.rest_day.hp_recover_ratio : p.overnight.hp_recover_ratio;
  let mpRatio = rested ? p.rest_day.mp_recover_ratio : p.overnight.mp_recover_ratio;
  if (hangover) mpRatio *= p.overnight.hangover_recover_multiplier;

  state.hp = Math.min(state.maxHp, state.hp + Math.round(state.maxHp * hpRatio));
  state.mp = Math.min(state.maxMp, state.mp + Math.round(state.maxMp * mpRatio));
  state.drunk = Math.floor(state.drunk * p.overnight.drunk_decay_ratio);

  let settlement: DayReport['settlement'] = null;
  if (crossesMonth(state.day, data.calendar)) {
    const rent = byId(data.homes, state.homeId).rent;
    state.money -= rent;
    const inDebt = state.money < 0;
    state.debtMonths = inDebt ? state.debtMonths + 1 : 0;
    settlement = { rent, moneyAfter: state.money, inDebt, debtMonths: state.debtMonths };
    if (state.debtMonths >= data.calendar.debt_game_over_months) state.gameOver = true;
  }

  state.day += 1;
  state.actionsLeft = p.actions_per_day;
  state.adRefillsLeft = p.ad_refills_per_day;
  state.workedToday = false;
  return { settlement, hangover, gameOver: state.gameOver };
}
