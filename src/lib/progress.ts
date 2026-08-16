// Aggregation for the Progress page. Pure functions over plain rows so the
// numbers can be unit-tested without a database.
//
// Two ideas run through this file:
//
// 1. Weeks here are plain CALENDAR weeks read off the food diary, not Week
//    plan rows. You can track without ever planning, so progress must not
//    depend on a plan existing.
// 2. A week is scored only if it was fully logged. An unlogged day is not a
//    zero-calorie day — it's an unknown one, and a total built on unknowns
//    isn't a win or a loss, it's noise.

import { addDays, calendarWeekStart } from "./weeks";
import { KCAL_PER_LB } from "./energy";

export interface DiaryEntry {
  date: string; // YYYY-MM-DD
  kcal: number;
  proteinG: number | null;
}

/** How a week landed relative to the bank, once tolerance is applied. */
export type Band = "on_target" | "under" | "over";

export interface CalendarWeek {
  weekOf: string; // Sunday
  weekEnd: string; // Saturday
  days: string[];
  entries: DiaryEntry[];
  consumedKcal: number;
  proteinTotalG: number;
  loggedDays: number;
  /** Days of this week that have actually happened (7 unless it's this week). */
  elapsedDays: number;
  inProgress: boolean;
  /** Every elapsed day has at least one entry — the precondition for scoring. */
  fullyLogged: boolean;
}

/**
 * Bucket the diary into Sunday-start weeks, from the first entry through the
 * week containing today. Weeks with nothing logged are kept: a gap is part of
 * the story, and dropping it would silently join two streaks.
 */
export function calendarWeeks(entries: DiaryEntry[], today: string): CalendarWeek[] {
  if (entries.length === 0) return [];

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const firstWeek = calendarWeekStart(sorted[0].date);
  const thisWeek = calendarWeekStart(today);

  const out: CalendarWeek[] = [];
  for (let weekOf = firstWeek; weekOf <= thisWeek; weekOf = addDays(weekOf, 7)) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekOf, i));
    const weekEnd = days[6];
    const mine = sorted.filter((e) => e.date >= weekOf && e.date <= weekEnd);
    const inProgress = weekOf === thisWeek;
    const elapsedDays = inProgress ? days.filter((d) => d <= today).length : 7;
    const loggedDays = new Set(mine.map((e) => e.date)).size;

    out.push({
      weekOf,
      weekEnd,
      days,
      entries: mine,
      consumedKcal: mine.reduce((sum, e) => sum + e.kcal, 0),
      proteinTotalG: mine.reduce((sum, e) => sum + (e.proteinG ?? 0), 0),
      loggedDays,
      elapsedDays,
      inProgress,
      fullyLogged: loggedDays >= elapsedDays && elapsedDays > 0,
    });
  }
  return out;
}

/** Within tolerance either way = on target; otherwise under or over. */
export function judgeWeek(consumedKcal: number, bankKcal: number, toleranceKcal: number): Band {
  const delta = bankKcal - consumedKcal; // positive = under
  if (Math.abs(delta) <= toleranceKcal) return "on_target";
  return delta > 0 ? "under" : "over";
}

export interface WeekVerdict extends CalendarWeek {
  bankKcal: number | null;
  /** What the week is measured against: the full bank, pro-rata while it runs. */
  bankSoFarKcal: number | null;
  /** bankSoFar − consumed. Positive = under. */
  bankDelta: number | null;
  band: Band | null;
  /** Under the bank plus tolerance, and fully logged. Null = not scorable. */
  isWin: boolean | null;
  avgKcalPerLoggedDay: number | null;
  proteinPerLoggedDay: number | null;
  maintenanceKcal: number | null;
  /** maintenance × logged days − consumed. The pounds-moving number. */
  deficitKcal: number | null;
  lbEquivalent: number | null;
}

/**
 * Score one week. The bank and maintenance come from the caller because both
 * change over time — a week keeps the numbers that were true while it ran.
 */
export function verdictFor(
  week: CalendarWeek,
  opts: { bankKcal: number | null; toleranceKcal: number; maintenanceKcal: number | null },
): WeekVerdict {
  const { bankKcal, toleranceKcal, maintenanceKcal } = opts;

  // A week still running is only fairly compared against the part of the bank
  // it has reached — a Tuesday is not a 10,000-calorie deficit.
  const bankSoFarKcal =
    bankKcal === null ? null : Math.round((bankKcal * week.elapsedDays) / 7);

  const scorable = bankSoFarKcal !== null && week.fullyLogged && week.loggedDays > 0;

  return {
    ...week,
    bankKcal,
    bankSoFarKcal,
    bankDelta: bankSoFarKcal === null ? null : bankSoFarKcal - week.consumedKcal,
    band: bankSoFarKcal === null ? null : judgeWeek(week.consumedKcal, bankSoFarKcal, toleranceKcal),
    isWin: scorable ? week.consumedKcal <= bankSoFarKcal! + toleranceKcal : null,
    avgKcalPerLoggedDay:
      week.loggedDays === 0 ? null : Math.round(week.consumedKcal / week.loggedDays),
    proteinPerLoggedDay:
      week.loggedDays === 0 ? null : Math.round(week.proteinTotalG / week.loggedDays),
    maintenanceKcal,
    deficitKcal:
      maintenanceKcal === null || week.loggedDays === 0
        ? null
        : maintenanceKcal * week.loggedDays - week.consumedKcal,
    lbEquivalent:
      maintenanceKcal === null || week.loggedDays === 0
        ? null
        : Math.round(((maintenanceKcal * week.loggedDays - week.consumedKcal) / KCAL_PER_LB) * 10) / 10,
  };
}

/**
 * Wins in a row, counting back from the most recent FINISHED week. The week
 * you're in never counts — it isn't over — but it doesn't break the run
 * either. An unscorable week (patchy logging, no bank) does break it: we
 * can't honestly call it a win.
 */
export function winStreak(verdicts: WeekVerdict[]): number {
  const finished = verdicts.filter((w) => !w.inProgress);
  let streak = 0;
  for (let i = finished.length - 1; i >= 0; i--) {
    if (finished[i].isWin === true) streak++;
    else break;
  }
  return streak;
}

/** Every deficit banked so far, including the week in progress. */
export function cumulativeDeficit(verdicts: WeekVerdict[]): number {
  return verdicts.reduce((sum, w) => sum + (w.deficitKcal ?? 0), 0);
}

/** Per-day kcal/protein totals for one week, including days with no entries. */
export function dailyTotals(days: string[], entries: DiaryEntry[]) {
  return days.map((date) => {
    const forDay = entries.filter((e) => e.date === date);
    return {
      date,
      kcal: forDay.reduce((sum, e) => sum + e.kcal, 0),
      proteinG: forDay.reduce((sum, e) => sum + (e.proteinG ?? 0), 0),
      logged: forDay.length > 0,
    };
  });
}

/** The per-day allowance a week's bank implies. */
export function dailyRate(budgetKcal: number | null, dayCount: number): number | null {
  if (budgetKcal === null || dayCount <= 0) return null;
  return Math.round(budgetKcal / dayCount);
}
