// Scale math for the Progress charts, kept out of the components so the
// numbers that decide what a chart LOOKS like are as tested as the numbers
// inside it. A misleading scale is a lie told with true data.

import { KCAL_PER_LB } from "./energy";
import { GOAL_INLINE_RANGE_LB } from "./goal";

export interface WeightDomain {
  lo: number;
  hi: number;
  /** Whether the goal is close enough to draw as a line inside the chart. */
  goalInline: boolean;
}

/**
 * Y-domain for the weight chart: zoomed to the actual readings so week-to-week
 * movement is visible. The goal only joins the domain when it's within
 * GOAL_INLINE_RANGE_LB of the readings — a 75 lb-away goal flattens months of
 * real progress into a horizontal line, so far goals live in a corner
 * annotation instead.
 */
export function weightDomain(
  weights: number[],
  goalLb: number | null,
  marginLb = 2,
): WeightDomain {
  const lo = Math.min(...weights);
  const hi = Math.max(...weights);
  const goalInline =
    goalLb !== null && goalLb >= lo - GOAL_INLINE_RANGE_LB && goalLb <= hi + GOAL_INLINE_RANGE_LB;

  const domLo = goalInline ? Math.min(lo, goalLb!) : lo;
  const domHi = goalInline ? Math.max(hi, goalLb!) : hi;
  return { lo: domLo - marginLb, hi: domHi + marginLb, goalInline };
}

/**
 * Round-number ticks inside [lo, hi] for a y-axis. Steps in 1/2/5×10ⁿ so the
 * labels read like weights, not like floats.
 */
export function niceTicks(lo: number, hi: number, maxTicks = 4): number[] {
  const span = hi - lo;
  if (span <= 0) return [Math.round(lo)];

  // Smallest 1/2/5×10ⁿ step whose ACTUAL tick count fits the budget —
  // counting ticks, not intervals, so a domain like 248–256 keeps step 2
  // (ticks 250/252/254/256) instead of leaping to step 5.
  const count = (step: number) =>
    Math.floor((hi + 1e-9) / step) - Math.ceil((lo - 1e-9) / step) + 1;
  const pow = 10 ** Math.floor(Math.log10(span / maxTicks));
  const step =
    [1, 2, 5, 10, 20, 50].map((m) => m * pow).find((s) => count(s) <= maxTicks) ?? 50 * pow;

  const ticks: number[] = [];
  for (let t = Math.ceil((lo - 1e-9) / step) * step; t <= hi + 1e-9; t += step) {
    ticks.push(Math.round(t * 10) / 10);
  }
  return ticks;
}

/**
 * Weekly-wins bar width, percent of a half-track, on a FIXED scale: a full
 * half-track is one pound of bank delta. Comparable across weeks and across
 * screenshots — unlike scaling to the noisiest week in view. Clamps at 100;
 * the caller shows a marker when clamped.
 */
export function deltaBarPct(
  deltaKcal: number | null,
  fullScaleKcal = KCAL_PER_LB,
): number | null {
  if (deltaKcal === null) return null;
  return Math.min((Math.abs(deltaKcal) / fullScaleKcal) * 100, 100);
}
