// Aggregation for the Progress page. Pure functions over plain rows so the
// numbers can be unit-tested without a database.
//
// Three ideas run through this file:
//
// 1. Weeks here are plain CALENDAR weeks read off the food diary, not Week
//    plan rows. You can track without ever planning, so progress must not
//    depend on a plan existing.
// 2. Days come in FOUR states and only one of them counts as evidence:
//      logged      — has at least one entry; the only state that enters math
//      empty       — no entries yet; an UNKNOWN, never a zero
//      not tracked — deliberately excluded (vacation); contributes nothing
//      future      — hasn't happened
//    Every sum, average, and verdict runs over logged days ONLY. A week's
//    bank is scaled to its logged days: log 5 of 7, you're measured against
//    5/7 of the bank — not handed the other two days as free deficit.
// 3. A week is only JUDGED (win/loss) when it's complete: finished, and every
//    day either logged or deliberately not tracked. Unknowns void the verdict.

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
  /** Days marked not-tracked that have already happened. */
  untrackedDays: number;
  /** Days of this week that have actually happened (7 unless it's this week). */
  elapsedDays: number;
  inProgress: boolean;
  /** Every elapsed day is logged or not-tracked — nothing unknown. */
  accounted: boolean;
}

/**
 * Bucket the diary into Sunday-start weeks, from the first entry through the
 * week containing today. Weeks with nothing logged are kept: a gap is part of
 * the story, and dropping it would silently join two streaks.
 */
export function calendarWeeks(
  entries: DiaryEntry[],
  today: string,
  untracked: ReadonlySet<string> = new Set(),
): CalendarWeek[] {
  if (entries.length === 0) return [];

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const firstWeek = calendarWeekStart(sorted[0].date);
  const thisWeek = calendarWeekStart(today);

  const out: CalendarWeek[] = [];
  for (let weekOf = firstWeek; weekOf <= thisWeek; weekOf = addDays(weekOf, 7)) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekOf, i));
    const weekEnd = days[6];
    // Entries on a not-tracked day are excluded from all math — the day was
    // declared out of scope, whatever half-log it holds.
    const mine = sorted.filter(
      (e) => e.date >= weekOf && e.date <= weekEnd && !untracked.has(e.date),
    );
    const inProgress = weekOf === thisWeek;
    const elapsed = inProgress ? days.filter((d) => d <= today) : days;
    const loggedSet = new Set(mine.map((e) => e.date));
    const untrackedElapsed = elapsed.filter((d) => untracked.has(d)).length;

    out.push({
      weekOf,
      weekEnd,
      days,
      entries: mine,
      consumedKcal: mine.reduce((sum, e) => sum + e.kcal, 0),
      proteinTotalG: mine.reduce((sum, e) => sum + (e.proteinG ?? 0), 0),
      loggedDays: loggedSet.size,
      untrackedDays: untrackedElapsed,
      elapsedDays: elapsed.length,
      inProgress,
      accounted:
        elapsed.length > 0 &&
        elapsed.every((d) => loggedSet.has(d) || untracked.has(d)),
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
  /** The bank scaled to logged days — what consumed is actually judged against. */
  bankSoFarKcal: number | null;
  /** bankSoFar − consumed. Positive = under. Null until something is logged. */
  bankDelta: number | null;
  band: Band | null;
  /** Win = complete week, under the scaled bank + tolerance. Null = not judgeable. */
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

  // Only logged days earn bank to eat against. No logging → no comparison at
  // all: an empty week must never render as a full week of deficit.
  const bankSoFarKcal =
    bankKcal === null || week.loggedDays === 0
      ? null
      : Math.round((bankKcal * week.loggedDays) / 7);

  // Judged only when the week is over and every day is accounted for.
  const judgeable = bankSoFarKcal !== null && !week.inProgress && week.accounted;

  return {
    ...week,
    bankKcal,
    bankSoFarKcal,
    bankDelta: bankSoFarKcal === null ? null : bankSoFarKcal - week.consumedKcal,
    band:
      bankSoFarKcal === null
        ? null
        : judgeWeek(week.consumedKcal, bankSoFarKcal, toleranceKcal),
    isWin: judgeable ? week.consumedKcal <= bankSoFarKcal! + toleranceKcal : null,
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
 * either. An unjudgeable week (unknown days, no bank) does break it: we
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
