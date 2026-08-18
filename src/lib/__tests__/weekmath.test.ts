import { describe, expect, it } from "vitest";
import { diaryTotals, weekTotals } from "../weekmath";

describe("weekTotals", () => {
  const recipes = [
    { name: "A", portions: 5, kcalPerServing: 520, proteinG: 42 },
    { name: "B", portions: 4, kcalPerServing: 610, proteinG: 45 },
  ];
  const staples = [
    { name: "shake", qty: 7, kcal: 230, proteinG: 42 },
    { name: "iced tea", qty: 2, kcal: null, proteinG: null }, // macro-less staple
  ];

  it("computes totals, treating macro-less staples as zero", () => {
    const t = weekTotals(recipes, staples, {
      budgetKcal: 16000, proteinLowGDay: 150, proteinHighGDay: 175,
    });
    expect(t.recipeKcal).toBe(5040); // 2600 + 2440
    expect(t.stapleKcal).toBe(1610); // 7 * 230
    expect(t.totalKcal).toBe(6650);
    expect(t.bankGap).toBe(9350);
    expect(t.totalProtein).toBe(684); // 210 + 180 + 294
    expect(t.proteinPerDay).toBe(98);
    expect(t.proteinGapPerDay).toBe(52);
  });

  it("returns null gaps when the user set no targets — no judgment", () => {
    const t = weekTotals(recipes, staples, {
      budgetKcal: null, proteinLowGDay: null, proteinHighGDay: null,
    });
    expect(t.totalKcal).toBe(6650);
    expect(t.bankGap).toBeNull();
    expect(t.proteinGapPerDay).toBeNull();
  });

  it("divides protein by the days the week actually covers, not always 7", () => {
    // 684 g over a 5-day week is ~137 g/day, not the 98 the /7 bug reported.
    const t = weekTotals(recipes, staples, {
      budgetKcal: 16000, proteinLowGDay: 150, proteinHighGDay: 175,
    }, 5);
    expect(t.proteinPerDay).toBe(137);
    expect(t.proteinGapPerDay).toBe(13);
  });
});

describe("diaryTotals", () => {
  it("tracks the remaining bank", () => {
    const d = diaryTotals(
      [
        { date: "2026-08-02", kcal: 2100, proteinG: 150 },
        { date: "2026-08-03", kcal: 2600, proteinG: 120 },
      ],
      16000,
    );
    expect(d.consumedKcal).toBe(4700);
    expect(d.bankRemaining).toBe(11300);
  });

  it("no bank target → no remaining number", () => {
    expect(diaryTotals([], null).bankRemaining).toBeNull();
  });
});
