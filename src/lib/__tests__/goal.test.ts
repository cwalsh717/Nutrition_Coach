import { describe, expect, it } from "vitest";
import { bandTone, resolveGoal, weightForWeek } from "../goal";

describe("resolveGoal", () => {
  it("maintain and eat_cleaner ignore the goal weight entirely", () => {
    for (const goalType of ["maintain", "eat_cleaner"] as const) {
      const g = resolveGoal({ goalType, goalWeightLb: 150, baselineLb: 200, latestLb: 195 });
      expect(g.direction).toBe("maintain");
      expect(g.goalLb).toBeNull();
      expect(g.mismatch).toBe(false);
    }
  });

  it("the weights decide the direction", () => {
    expect(
      resolveGoal({ goalType: "lose", goalWeightLb: 160, baselineLb: 200, latestLb: null }).direction,
    ).toBe("lose");
    expect(
      resolveGoal({ goalType: "gain", goalWeightLb: 190, baselineLb: 150, latestLb: null }).direction,
    ).toBe("gain");
  });

  it("weights beat a contradicting goalType, and say so", () => {
    // Profile says lose, but the goal weight is ABOVE the baseline.
    const g = resolveGoal({ goalType: "lose", goalWeightLb: 210, baselineLb: 180, latestLb: null });
    expect(g.direction).toBe("gain");
    expect(g.mismatch).toBe(true);
  });

  it("missing weights fall back to the stated goal, no mismatch", () => {
    const g = resolveGoal({ goalType: "gain", goalWeightLb: null, baselineLb: 150, latestLb: null });
    expect(g.direction).toBe("gain");
    expect(g.mismatch).toBe(false);
    expect(g.reached).toBe(false);
  });

  it("reached: loser at or under goal, within half a pound", () => {
    const base = { goalType: "lose" as const, goalWeightLb: 180, baselineLb: 220 };
    expect(resolveGoal({ ...base, latestLb: 180.4 }).reached).toBe(true);
    expect(resolveGoal({ ...base, latestLb: 180.6 }).reached).toBe(false);
    expect(resolveGoal({ ...base, latestLb: 175 }).reached).toBe(true); // overshoot still reached
  });

  it("reached: gainer at or over goal", () => {
    const base = { goalType: "gain" as const, goalWeightLb: 170, baselineLb: 150 };
    expect(resolveGoal({ ...base, latestLb: 169.6 }).reached).toBe(true);
    expect(resolveGoal({ ...base, latestLb: 168 }).reached).toBe(false);
  });

  it("goal within epsilon of baseline keeps the stated direction and reads reached", () => {
    const g = resolveGoal({ goalType: "lose", goalWeightLb: 200, baselineLb: 200.3, latestLb: null });
    expect(g.direction).toBe("lose");
    expect(g.reached).toBe(true);
  });
});

describe("bandTone", () => {
  it("flips which side is virtuous by direction", () => {
    expect(bandTone("under", "lose")).toBe("good");
    expect(bandTone("over", "lose")).toBe("bad");
    expect(bandTone("under", "gain")).toBe("bad");
    expect(bandTone("over", "gain")).toBe("good");
    expect(bandTone("under", "maintain")).toBe("bad");
    expect(bandTone("over", "maintain")).toBe("bad");
    for (const d of ["lose", "gain", "maintain"] as const) {
      expect(bandTone("on_target", d)).toBe("good");
    }
  });
});

describe("weightForWeek", () => {
  const readings = [
    { date: "2026-08-01", weightLb: 250 },
    { date: "2026-08-08", weightLb: 247 },
    { date: "2026-08-15", weightLb: 244 },
  ];

  it("uses the latest reading on or before the week's end", () => {
    expect(weightForWeek(readings, "2026-08-09")).toBe(247);
    expect(weightForWeek(readings, "2026-08-08")).toBe(247); // boundary inclusive
    expect(weightForWeek(readings, "2026-08-20")).toBe(244);
  });

  it("never lets a future reading describe a past week", () => {
    // Week ends Aug 2: only the Aug 1 reading may speak for it, even though
    // Aug 8 is nearer to some mid-week dates than Aug 1 is.
    expect(weightForWeek(readings, "2026-08-02")).toBe(250);
  });

  it("falls back to the earliest reading for weeks before any weigh-in", () => {
    expect(weightForWeek(readings, "2026-07-01")).toBe(250);
  });

  it("is null with no readings", () => {
    expect(weightForWeek([], "2026-08-01")).toBeNull();
  });
});
