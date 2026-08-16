// Which way is "good"? Everything on the Progress page — win rules, bar
// colors, the countdown's very direction — hangs on whether the user is
// losing, gaining, or holding. This module answers that once, so the rest of
// the app never re-derives it.
//
// The weights outrank the stated goal type: if the profile says "lose" but
// the goal weight sits ABOVE the latest reading, the numbers describe gaining
// and we score honestly against the numbers — surfacing the contradiction
// instead of silently picking a side.

import type { Band } from "./progress";

export type Direction = "lose" | "gain" | "maintain";

/** Float scale readings vs integer goal weights: closer than this is "there". */
export const REACHED_EPSILON_LB = 0.5;
/** Half-width of the steadiness band a maintainer is judged against. */
export const MAINTAIN_BAND_LB = 3;
/** Within this many lb of goal, the weight chart draws the goal line inline. */
export const GOAL_INLINE_RANGE_LB = 15;

export interface GoalResolution {
  direction: Direction;
  /** The target. Null for maintainers — they have nowhere to go. */
  goalLb: number | null;
  baselineLb: number | null;
  /** goalType says one thing, the weights say the other. */
  mismatch: boolean;
  /** Latest reading (or baseline) is at/past goal, within epsilon. */
  reached: boolean;
}

export function resolveGoal(input: {
  goalType: Direction | "eat_cleaner" | null;
  goalWeightLb: number | null;
  baselineLb: number | null;
  latestLb: number | null;
}): GoalResolution {
  const { goalType, goalWeightLb, baselineLb, latestLb } = input;

  if (goalType === "maintain" || goalType === "eat_cleaner") {
    return { direction: "maintain", goalLb: null, baselineLb, mismatch: false, reached: false };
  }

  const stated: Direction | null = goalType; // "lose" | "gain" | null

  if (goalWeightLb === null || baselineLb === null) {
    // Not enough numbers to infer anything — the stated goal (or lose, the
    // commonest ask) stands, and the page will prompt for what's missing.
    return {
      direction: stated ?? "lose",
      goalLb: goalWeightLb,
      baselineLb,
      mismatch: false,
      reached: false,
    };
  }

  // Both weights known: they decide the direction.
  const gapLb = goalWeightLb - baselineLb;
  const weighed: Direction | null =
    gapLb < -REACHED_EPSILON_LB ? "lose" : gapLb > REACHED_EPSILON_LB ? "gain" : null;

  const direction = weighed ?? stated ?? "lose";
  const current = latestLb ?? baselineLb;
  const reached =
    direction === "lose"
      ? current <= goalWeightLb + REACHED_EPSILON_LB
      : direction === "gain"
        ? current >= goalWeightLb - REACHED_EPSILON_LB
        : true;

  return {
    direction,
    goalLb: goalWeightLb,
    baselineLb,
    mismatch: stated !== null && weighed !== null && stated !== weighed,
    reached,
  };
}

/**
 * Which tone a band deserves under a direction. "Under the bank" is virtue
 * for a loser, failure for a gainer, and drift for a maintainer.
 */
export function bandTone(band: Band, direction: Direction): "good" | "bad" | "neutral" {
  if (band === "on_target") return "good";
  if (direction === "maintain") return "bad";
  if (direction === "lose") return band === "under" ? "good" : "bad";
  return band === "over" ? "good" : "bad"; // gain
}

export interface DatedWeighIn {
  date: string; // YYYY-MM-DD
  weightLb: number;
}

/**
 * The weight a past week should be scored with: the latest weigh-in on or
 * before the week's end. A reading from the future can't describe the body
 * that week — fall back to the earliest reading only when the week predates
 * every weigh-in.
 */
export function weightForWeek(weighIns: DatedWeighIn[], weekEnd: string): number | null {
  if (weighIns.length === 0) return null;
  const sorted = [...weighIns].sort((a, b) => a.date.localeCompare(b.date));
  let latest: DatedWeighIn | null = null;
  for (const w of sorted) {
    if (w.date <= weekEnd) latest = w;
    else break;
  }
  return (latest ?? sorted[0]).weightLb;
}
