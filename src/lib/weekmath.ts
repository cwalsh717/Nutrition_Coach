// The calorie-bank math. Pure: takes plain rows, returns numbers.
// Judgment (gaps, over/under) appears ONLY when the week has targets set —
// a user with no goals sees totals, never a scolding.

export interface RecipeLine {
  name: string;
  portions: number;
  kcalPerServing: number;
  proteinG: number;
}

export interface StapleLine {
  name: string;
  qty: number;
  kcal: number | null;
  proteinG: number | null;
}

export interface WeekTargets {
  budgetKcal: number | null;
  proteinLowGDay: number | null;
  proteinHighGDay: number | null;
}

export function weekTotals(
  recipes: RecipeLine[],
  staples: StapleLine[],
  targets: WeekTargets,
  /** How many days the week covers — a 5-day week eats its protein in 5. */
  dayCount = 7,
) {
  const recipeKcal = recipes.reduce((sum, r) => sum + r.portions * r.kcalPerServing, 0);
  const recipeProtein = recipes.reduce((sum, r) => sum + r.portions * r.proteinG, 0);
  const stapleKcal = staples.reduce((sum, s) => sum + s.qty * (s.kcal ?? 0), 0);
  const stapleProtein = staples.reduce((sum, s) => sum + s.qty * (s.proteinG ?? 0), 0);

  const totalKcal = recipeKcal + stapleKcal;
  const totalProtein = recipeProtein + stapleProtein;
  const proteinPerDay = Math.round(totalProtein / Math.max(1, dayCount));

  return {
    recipeKcal,
    stapleKcal,
    totalKcal,
    totalProtein,
    proteinPerDay,
    // null when the user has no bank target — callers render totals only.
    bankGap: targets.budgetKcal === null ? null : targets.budgetKcal - totalKcal,
    proteinGapPerDay:
      targets.proteinLowGDay === null ? null : targets.proteinLowGDay - proteinPerDay,
  };
}

export interface DiaryDay {
  date: string; // YYYY-MM-DD
  kcal: number;
  proteinG: number;
}

export function diaryTotals(days: DiaryDay[], budgetKcal: number | null) {
  const consumedKcal = days.reduce((sum, d) => sum + d.kcal, 0);
  return {
    consumedKcal,
    bankRemaining: budgetKcal === null ? null : budgetKcal - consumedKcal,
  };
}
