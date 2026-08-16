// Suggested weekly calorie target from the user's own vitals.
// Pure math, no DB: Mifflin-St Jeor BMR -> activity multiplier -> weekly,
// then a goal adjustment. This produces a SUGGESTION the onboarding slider
// starts at — the user always confirms or overrides the number.

export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "very" | "extra";
export type Goal = "lose" | "gain" | "maintain" | "eat_cleaner";

export const ACTIVITY_MULTIPLIER: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
  extra: 1.9,
};

// ~500 kcal/day deficit ≈ 1 lb/week loss; surplus mirrors it for gain.
const GOAL_DAILY_ADJUSTMENT: Record<Goal, number> = {
  lose: -500,
  gain: +350,
  maintain: 0,
  eat_cleaner: 0,
};

export interface Vitals {
  sex: Sex;
  age: number;
  heightIn: number;
  weightLb: number;
}

/** Mifflin-St Jeor basal metabolic rate, kcal/day. Takes US units, converts inside. */
export function bmr({ sex, age, heightIn, weightLb }: Vitals): number {
  const kg = weightLb * 0.453592;
  const cm = heightIn * 2.54;
  const base = 10 * kg + 6.25 * cm - 5 * age;
  return Math.round(sex === "male" ? base + 5 : base - 161);
}

/** Suggested weekly kcal bank, rounded to the nearest 100 for a sane slider. */
export function suggestedWeeklyKcal(vitals: Vitals, activity: Activity, goal: Goal): number {
  const daily = bmr(vitals) * ACTIVITY_MULTIPLIER[activity] + GOAL_DAILY_ADJUSTMENT[goal];
  // Floor at a safe minimum: never suggest a crash diet.
  const floored = Math.max(daily, vitals.sex === "male" ? 1500 : 1200);
  return Math.round((floored * 7) / 100) * 100;
}

/** Common protein guidance (0.7–1 g per lb of goal or current weight). Suggestion only. */
export function suggestedProteinRange(weightLb: number, goalWeightLb?: number | null) {
  const basis = goalWeightLb ?? weightLb;
  return {
    low: Math.round(basis * 0.7),
    high: Math.round(basis * 1.0),
  };
}
