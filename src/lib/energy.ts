// The energy ledger: what you burn, what you eat, and what the difference is
// worth in pounds. Pure math, no DB, so every number on the Progress page can
// be unit-tested.
//
// One constant runs the whole thing: a pound of fat is worth about 3,500 kcal.
// Eat 3,500 fewer than you burn and the scale should move a pound. The point
// of the page is checking whether it actually does — and if it doesn't, the
// maintenance estimate is the thing that's wrong.

import { ACTIVITY_MULTIPLIER, bmr, type Activity, type Vitals } from "./targets";

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

/**
 * Trend from the scale, in lb per week. Least squares over every weigh-in
 * rather than first-vs-last, because water weight makes any single reading a
 * liar. Negative = losing. Null until there are two weigh-ins on two dates.
 */
export function weightTrendLbPerWeek(points: WeighIn[]): number | null {
  const dates = new Set(points.map((p) => p.date));
  if (points.length < 2 || dates.size < 2) return null;

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
  loggedDays: number;
  /** Calendar days the window spans, logged or not. */
  windowDays: number;
  /** Weight change across the window; negative = lost. */
  lbChange: number;
}

/**
 * What the data says maintenance actually is: your average intake plus the
 * daily deficit the scale proves you ran. This is the honest number — it
 * needs no formula and no guess about activity.
 *
 * Returns null unless the evidence is good enough: at least a fortnight, and
 * at least 80% of those days logged. Unlogged days are never estimated; the
 * average intake is assumed to hold across them, which is only fair when
 * they're rare.
 */
export function impliedMaintenance(input: ImpliedInput): number | null {
  const { consumedKcal, loggedDays, windowDays, lbChange } = input;
  if (windowDays < 14 || loggedDays === 0) return null;
  if (loggedDays / windowDays < 0.8) return null;

  const avgIntake = consumedKcal / loggedDays;
  const deficitPerDay = (-lbChange * KCAL_PER_LB) / windowDays;
  const implied = Math.round(avgIntake + deficitPerDay);
  // Outside human range the inputs are junk — a mistyped weight, a week of
  // entries missed — not a discovery about your metabolism.
  return implied < 1000 || implied > 6000 ? null : implied;
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

export interface BurnDown {
  /** (start − goal) × 3,500. The whole job, in calories. */
  totalKcal: number;
  /** Deficit banked so far, by the food log. Negative if you're over. */
  burnedByCaloriesKcal: number;
  /** Deficit the scale says you banked. Null with fewer than two weigh-ins. */
  burnedByScaleKcal: number | null;
  /** Still to burn, by the food log. Never below zero. */
  remainingKcal: number;
  lbByCalories: number;
  lbByScale: number | null;
  /** Scale minus calories. Positive = losing faster than the math predicts. */
  gapKcal: number | null;
  /** 0–100, by the food log. */
  pctComplete: number;
}

/**
 * The countdown. Two independent estimates of the same thing — what you ate,
 * and what you weigh — so a disagreement between them is visible instead of
 * silently averaged away. That gap is the maintenance estimate being wrong.
 */
export function burnDown(input: {
  baselineLb: number;
  goalLb: number;
  cumulativeDeficitKcal: number;
  latestLb: number | null;
}): BurnDown {
  const { baselineLb, goalLb, cumulativeDeficitKcal, latestLb } = input;
  const totalKcal = Math.round((baselineLb - goalLb) * KCAL_PER_LB);
  const burnedByScaleKcal =
    latestLb === null ? null : Math.round((baselineLb - latestLb) * KCAL_PER_LB);

  return {
    totalKcal,
    burnedByCaloriesKcal: Math.round(cumulativeDeficitKcal),
    burnedByScaleKcal,
    remainingKcal: Math.max(totalKcal - Math.round(cumulativeDeficitKcal), 0),
    lbByCalories: round1(cumulativeDeficitKcal / KCAL_PER_LB),
    lbByScale: latestLb === null ? null : round1(baselineLb - latestLb),
    gapKcal: burnedByScaleKcal === null ? null : burnedByScaleKcal - Math.round(cumulativeDeficitKcal),
    pctComplete:
      totalKcal <= 0 ? 0 : clamp((cumulativeDeficitKcal / totalKcal) * 100, 0, 100),
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
