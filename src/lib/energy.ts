// The energy ledger: what you burn, what you eat, and what the difference is
// worth in pounds. Pure math, no DB, so every number on the Progress page can
// be unit-tested.
//
// One constant runs the whole thing: a pound of fat is worth about 3,500 kcal.
// Eat 3,500 fewer than you burn and the scale should move a pound. The point
// of the page is checking whether it actually does — and if it doesn't, the
// maintenance estimate is the thing that's wrong.

import { ACTIVITY_MULTIPLIER, bmr, type Activity, type Vitals } from "./targets";
import { addDays } from "./weeks";

export const KCAL_PER_LB = 3500;

export interface WeighIn {
  date: string; // YYYY-MM-DD
  weightLb: number;
}

/**
 * Maintenance from the textbook formula: BMR × activity. Feed it the LATEST
 * weigh-in, not the onboarding weight — a smaller body burns less, so this
 * number is supposed to drift down as the scale does.
 */
export function formulaMaintenance(vitals: Vitals, activity: Activity): number {
  return Math.round(bmr(vitals) * ACTIVITY_MULTIPLIER[activity]);
}

/** Calendar days between the first and last weigh-in. */
export function weighInSpanDays(points: WeighIn[]): number {
  if (points.length < 2) return 0;
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return dayNumber(sorted[sorted.length - 1].date) - dayNumber(sorted[0].date);
}

/**
 * Trend from the scale, in lb per week. Least squares over every weigh-in
 * rather than first-vs-last, because water weight makes any single reading a
 * liar. Negative = losing. Null until the readings span at least two weeks —
 * a slope fitted to a few days extrapolates noise, not a trend.
 */
export function weightTrendLbPerWeek(points: WeighIn[], minSpanDays = 14): number | null {
  const dates = new Set(points.map((p) => p.date));
  if (points.length < 2 || dates.size < 2) return null;
  if (weighInSpanDays(points) < minSpanDays) return null;

  // x = days since the first weigh-in, y = pounds.
  const origin = dayNumber(points[0].date);
  const xs = points.map((p) => dayNumber(p.date) - origin);
  const ys = points.map((p) => p.weightLb);
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return null;
  return round1((num / den) * 7);
}

export interface ImpliedInput {
  consumedKcal: number;
  /** Days of eating between the two weigh-ins. The CALLER guarantees every
   *  one of them is fully logged (impliedWindow enforces it). */
  days: number;
  /** Weight change across the window; negative = lost. */
  lbChange: number;
}

/**
 * What the data says maintenance actually is: your average intake plus the
 * daily deficit the scale proves you ran. This is the honest number — it
 * needs no formula and no guess about activity. Full log coverage is the
 * caller's contract; this function only guards the arithmetic.
 */
export function impliedMaintenance(input: ImpliedInput): number | null {
  const { consumedKcal, days, lbChange } = input;
  if (days < 14) return null;

  const avgIntake = consumedKcal / days;
  const deficitPerDay = (-lbChange * KCAL_PER_LB) / days;
  const implied = Math.round(avgIntake + deficitPerDay);
  // Outside human range the inputs are junk — a mistyped weight, a week of
  // entries missed — not a discovery about your metabolism.
  return implied < 1000 || implied > 6000 ? null : implied;
}

export interface ImpliedWindowProgress {
  /** Longest run of consecutive fully-logged days starting at a weigh-in. */
  bestRunDays: number;
  requiredDays: number;
  /** Last logged day of the best run — lets the UI say whether the run is
   *  still alive and a closing weigh-in would finish the job. */
  bestRunEnd: string | null;
}

/**
 * How close the user is to unlocking the data-implied number — fuel for a
 * "7 of 15 days" meter instead of a vague promise. Only runs anchored at a
 * weigh-in can ever qualify, so that's what we measure.
 */
export function impliedWindowProgress(
  weighInDates: readonly string[],
  loggedDates: ReadonlySet<string>,
  untrackedDates: ReadonlySet<string>,
  requiredDays = 15,
): ImpliedWindowProgress {
  let best = 0;
  let bestEnd: string | null = null;
  for (const anchor of weighInDates) {
    let run = 0;
    let d = anchor;
    while (loggedDates.has(d) && !untrackedDates.has(d) && run < requiredDays) {
      run++;
      d = addDays(d, 1);
    }
    if (run > best) {
      best = run;
      bestEnd = addDays(d, -1);
    }
  }
  return { bestRunDays: Math.min(best, requiredDays), requiredDays, bestRunEnd: bestEnd };
}

export interface ImpliedWindow {
  start: string; // weigh-in day opening the stretch
  end: string; // weigh-in day closing it
  days: string[]; // every day in [start, end]
}

/**
 * Pick the stretch the data-implied maintenance may run on: consecutive
 * LOGGED days, bracketed by weigh-ins on the first and last day. An empty or
 * not-tracked day breaks the stretch — averaging across a day we know nothing
 * about (or were told to ignore) would poison the estimate rather than widen
 * it. Longest qualifying stretch wins; null if none reaches minDays.
 *
 * minDays counts calendar days INCLUSIVE of both weigh-in days, so the
 * default 15 means 14 measured days between the two scale readings.
 */
export function impliedWindow(
  weighInDates: readonly string[],
  loggedDates: ReadonlySet<string>,
  untrackedDates: ReadonlySet<string>,
  minDays = 15,
): ImpliedWindow | null {
  const anchors = [...weighInDates].sort();
  let best: ImpliedWindow | null = null;

  for (let i = 0; i < anchors.length; i++) {
    for (let j = i + 1; j < anchors.length; j++) {
      const days = spanDays(anchors[i], anchors[j]);
      if (days.length < minDays) continue;
      if (best && days.length <= best.days.length) continue;
      if (days.every((d) => loggedDates.has(d) && !untrackedDates.has(d))) {
        best = { start: anchors[i], end: anchors[j], days };
      }
    }
  }
  return best;
}

function spanDays(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(start + "T00:00:00Z");
  const stop = new Date(end + "T00:00:00Z");
  while (d <= stop) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export type MaintenanceSource = "manual" | "implied" | "formula";

export interface EffectiveMaintenance {
  value: number | null;
  source: MaintenanceSource | null;
}

/**
 * Which maintenance number is in force. A number you typed always wins — the
 * app never overrules you. Otherwise the data beats the formula, and the
 * formula is the fallback until there's enough data to beat it.
 */
export function effectiveMaintenance(input: {
  manual: number | null;
  implied: number | null;
  formula: number | null;
}): EffectiveMaintenance {
  if (input.manual !== null) return { value: input.manual, source: "manual" };
  if (input.implied !== null) return { value: input.implied, source: "implied" };
  if (input.formula !== null) return { value: input.formula, source: "formula" };
  return { value: null, source: null };
}

export interface GoalProgress {
  direction: "lose" | "gain";
  /** |baseline − goal| × 3,500: the whole job in calories. */
  totalKcal: number;
  /** Energy banked TOWARD the goal (deficit for lose, surplus for gain).
   *  Negative = the food log says you moved away from it. */
  bankedByCaloriesKcal: number;
  /** Same thing as the scale tells it. Null with fewer than two weigh-ins. */
  bankedByScaleKcal: number | null;
  /** Still to bank, by the food log. Never below zero. */
  remainingKcal: number;
  /** Signed pounds, positive = progress — in EITHER direction. */
  lbByCalories: number;
  lbByScale: number | null;
  /** Scale minus calories, in progress units. The calibration signal. */
  gapKcal: number | null;
  /** 0–100 by the food log. Safe at zero total. */
  pctByCalories: number;
  reachedByScale: boolean;
  /** Pounds past the goal, when the scale says you overshot it. */
  overshootLb: number | null;
}

/**
 * The countdown, pointed whichever way the goal points. Two independent
 * estimates of the same journey — what you ate and what you weigh — so a
 * disagreement is visible instead of silently averaged away.
 *
 * Sign convention: positive always means "toward the goal". A gainer's
 * surplus and a loser's deficit both land on the plus side.
 */
export function goalProgress(input: {
  direction: "lose" | "gain";
  baselineLb: number;
  goalLb: number;
  /** Cumulative deficit from the diary; + = ate under maintenance. */
  cumulativeDeficitKcal: number;
  latestLb: number | null;
}): GoalProgress {
  const { direction, baselineLb, goalLb, cumulativeDeficitKcal, latestLb } = input;
  const sign = direction === "lose" ? 1 : -1;

  const totalKcal = Math.round(Math.abs(baselineLb - goalLb) * KCAL_PER_LB);
  const bankedByCaloriesKcal = Math.round(sign * cumulativeDeficitKcal);
  const scaleLbProgress = latestLb === null ? null : sign * (baselineLb - latestLb);
  const bankedByScaleKcal =
    scaleLbProgress === null ? null : Math.round(scaleLbProgress * KCAL_PER_LB);

  const reachedByScale =
    latestLb !== null &&
    (direction === "lose" ? latestLb <= goalLb + 0.5 : latestLb >= goalLb - 0.5);
  const overshoot =
    latestLb === null ? null : round1(direction === "lose" ? goalLb - latestLb : latestLb - goalLb);

  return {
    direction,
    totalKcal,
    bankedByCaloriesKcal,
    bankedByScaleKcal,
    remainingKcal: Math.max(totalKcal - bankedByCaloriesKcal, 0),
    lbByCalories: round1(bankedByCaloriesKcal / KCAL_PER_LB),
    lbByScale: scaleLbProgress === null ? null : round1(scaleLbProgress),
    gapKcal: bankedByScaleKcal === null ? null : bankedByScaleKcal - bankedByCaloriesKcal,
    pctByCalories:
      totalKcal <= 0 ? 0 : clamp((bankedByCaloriesKcal / totalKcal) * 100, 0, 100),
    reachedByScale,
    overshootLb: overshoot !== null && overshoot > 0 && reachedByScale ? overshoot : null,
  };
}

export interface Steadiness {
  baselineLb: number;
  /** Half-width of the band steadiness is judged inside. */
  bandLb: number;
  latestLb: number | null;
  /** latest − baseline, one decimal. Positive = heavier. */
  deviationLb: number | null;
  withinBand: boolean | null;
}

/** A maintainer's whole scoreboard: how far the scale has drifted from where
 *  they started, and whether that's still inside the band. */
export function steadiness(input: {
  baselineLb: number;
  latestLb: number | null;
  bandLb?: number;
}): Steadiness {
  const { baselineLb, latestLb, bandLb = 3 } = input;
  const deviationLb = latestLb === null ? null : round1(latestLb - baselineLb);
  return {
    baselineLb,
    bandLb,
    latestLb,
    deviationLb,
    withinBand: deviationLb === null ? null : Math.abs(deviationLb) <= bandLb,
  };
}

function dayNumber(iso: string): number {
  return Math.round(new Date(iso + "T00:00:00Z").getTime() / 86_400_000);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}
