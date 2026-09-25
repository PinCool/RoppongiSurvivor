import type { CalendarData } from '../data/types';

export interface GameDate {
  /** 1〜12 */
  month: number;
  /** 1〜weeks_per_month */
  week: number;
  /** 0 = 月曜 … 6 = 日曜 */
  weekday: number;
  /** 通算の月（0 始まり）。家賃の精算の判定に使う */
  monthIndex: number;
}

export function daysPerMonth(cal: CalendarData): number {
  return cal.weeks_per_month * 7;
}

/** 通算日 -> 暦。1 か月は weeks_per_month 週ちょうど（パワプロ式） */
export function dateOf(day: number, cal: CalendarData): GameDate {
  const perMonth = daysPerMonth(cal);
  const monthIndex = Math.floor(day / perMonth);
  const inMonth = day - monthIndex * perMonth;
  return {
    month: ((cal.start_month - 1 + monthIndex) % 12) + 1,
    week: Math.floor(inMonth / 7) + 1,
    weekday: inMonth % 7,
    monthIndex,
  };
}

export function isClosedDay(day: number, cal: CalendarData): boolean {
  return dateOf(day, cal).weekday === cal.closed_weekday;
}

/** day から day + 1 へ進むときに月をまたぐか（= 月末の精算が走るか） */
export function crossesMonth(day: number, cal: CalendarData): boolean {
  return dateOf(day + 1, cal).monthIndex !== dateOf(day, cal).monthIndex;
}
