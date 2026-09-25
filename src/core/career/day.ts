import { byId } from '../data/gameData';
import type { GameData } from '../data/types';
import { crossesMonth } from './calendar';
import type { PlayerState } from './playerState';
import { monthlyFees } from './selfCare';

export interface DayReport {
  /** 月末の精算が走ったときだけ。fees は月額（ジムなど）の合計 */
  settlement: { rent: number; fees: number; moneyAfter: number; inDebt: boolean; debtMonths: number } | null;
  hangover: boolean;
  /** 今朝切れた期間つきの自分磨き。rebound はその反動で素の能力値から引いた量 */
  expired: { itemId: string; rebound: number }[];
  gameOver: boolean;
}

/**
 * 1 日を終えて翌朝へ進める。寝て回復 → 酔いが抜ける → 月をまたげば家賃と月額を払う → 期間つきの効き目が切れる。
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
    const fees = monthlyFees(state, data);
    state.money -= rent + fees;
    const inDebt = state.money < 0;
    state.debtMonths = inDebt ? state.debtMonths + 1 : 0;
    settlement = { rent, fees, moneyAfter: state.money, inDebt, debtMonths: state.debtMonths };
    if (state.debtMonths >= data.calendar.debt_game_over_months) state.gameOver = true;
  }

  state.day += 1;
  const expired = expireEffects(state, data);
  state.actionsLeft = p.actions_per_day;
  state.adRefillsLeft = p.ad_refills_per_day;
  state.workedToday = false;
  return { settlement, hangover, expired, gameOver: state.gameOver };
}

/** 期限の来た効き目を外し、反動（rebound）の分だけ素の能力値を下げる。能力値は 0 未満にしない */
function expireEffects(state: PlayerState, data: GameData): DayReport['expired'] {
  const expired: DayReport['expired'] = [];
  state.effects = state.effects.filter((effect) => {
    if (effect.expiresDay > state.day) return true;
    const item = data.selfCare.find((i) => i.id === effect.itemId);
    const rebound = item?.rebound ?? 0;
    if (item && rebound > 0) {
      for (const stat of Object.keys(item.gains) as (keyof typeof item.gains)[]) state[stat] = Math.max(0, state[stat] - rebound);
    }
    expired.push({ itemId: effect.itemId, rebound });
    return false;
  });
  return expired;
}
