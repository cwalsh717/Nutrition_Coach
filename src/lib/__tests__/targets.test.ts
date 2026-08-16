import { describe, expect, it } from "vitest";
import { bmr, suggestedProteinRange, suggestedWeeklyKcal } from "../targets";

describe("bmr (Mifflin-St Jeor)", () => {
  it("matches a hand-computed male case", () => {
    // 200 lb = 90.7184 kg, 72 in = 182.88 cm, age 45, male:
    // 10*90.7184 + 6.25*182.88 - 5*45 + 5 = 907.184 + 1143.0 - 225 + 5 = 1830.184
    expect(bmr({ sex: "male", age: 45, heightIn: 72, weightLb: 200 })).toBe(1830);
  });

  it("female offset is -161 instead of +5", () => {
    const male = bmr({ sex: "male", age: 45, heightIn: 72, weightLb: 200 });
    const female = bmr({ sex: "female", age: 45, heightIn: 72, weightLb: 200 });
    expect(male - female).toBe(166);
  });
});

describe("suggestedWeeklyKcal", () => {
  it("applies activity, goal deficit, and rounds to 100", () => {
    // BMR 1830 * 1.375 (light) = 2516.25; -500 (lose) = 2016.25/day
    // * 7 = 14113.75 → rounds to 14100
    const weekly = suggestedWeeklyKcal(
      { sex: "male", age: 45, heightIn: 72, weightLb: 200 },
      "light",
      "lose",
    );
    expect(weekly).toBe(14100);
    expect(weekly % 100).toBe(0);
  });

  it("never suggests below the safety floor", () => {
    const weekly = suggestedWeeklyKcal(
      { sex: "female", age: 60, heightIn: 58, weightLb: 90 },
      "sedentary",
      "lose",
    );
    expect(weekly).toBeGreaterThanOrEqual(1200 * 7);
  });
});

describe("suggestedProteinRange", () => {
  it("uses goal weight when present, 0.7-1.0 g/lb", () => {
    expect(suggestedProteinRange(220, 150)).toEqual({ low: 105, high: 150 });
    expect(suggestedProteinRange(220, null)).toEqual({ low: 154, high: 220 });
  });
});
