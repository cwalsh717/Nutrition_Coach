import { describe, expect, it } from "vitest";
import {
  burnDown, effectiveMaintenance, formulaMaintenance, impliedMaintenance,
  impliedWindow, weightTrendLbPerWeek,
} from "../energy";

const VITALS = { sex: "male", age: 45, heightIn: 72, weightLb: 200 } as const;

describe("formulaMaintenance", () => {
  it("is BMR times the activity multiplier", () => {
    // BMR ≈ 10(90.72) + 6.25(182.88) − 5(45) + 5 = 1,830
    expect(formulaMaintenance(VITALS, "sedentary")).toBe(2196); // × 1.2
    expect(formulaMaintenance(VITALS, "light")).toBe(2516); // × 1.375
  });

  it("falls as the weight it is given falls", () => {
    const heavier = formulaMaintenance(VITALS, "light");
    const lighter = formulaMaintenance({ ...VITALS, weightLb: 180 }, "light");
    expect(lighter).toBeLessThan(heavier);
  });
});

describe("weightTrendLbPerWeek", () => {
  it("needs two weigh-ins on two dates", () => {
    expect(weightTrendLbPerWeek([])).toBeNull();
    expect(weightTrendLbPerWeek([{ date: "2026-08-01", weightLb: 200 }])).toBeNull();
    expect(
      weightTrendLbPerWeek([
        { date: "2026-08-01", weightLb: 200 },
        { date: "2026-08-01", weightLb: 201 },
      ]),
    ).toBeNull();
  });

  it("reads a clean loss as negative pounds per week", () => {
    const trend = weightTrendLbPerWeek([
      { date: "2026-07-05", weightLb: 200 },
      { date: "2026-07-12", weightLb: 198 },
      { date: "2026-07-19", weightLb: 196 },
    ]);
    expect(trend).toBe(-2);
  });

  it("rides through a water-weight bounce instead of following it", () => {
    // Endpoints alone would say flat; the line through all four says losing.
    const trend = weightTrendLbPerWeek([
      { date: "2026-07-05", weightLb: 200 },
      { date: "2026-07-12", weightLb: 197 },
      { date: "2026-07-19", weightLb: 196 },
      { date: "2026-07-26", weightLb: 200 },
    ]);
    expect(trend).toBeLessThan(0);
  });
});

describe("impliedMaintenance", () => {
  const base = { consumedKcal: 2000 * 28, loggedDays: 28, windowDays: 28, lbChange: -4 };

  it("is average intake plus the deficit the scale proves", () => {
    // 2,000/day eaten, 4 lb off in 28 days = 14,000 kcal = 500/day.
    expect(impliedMaintenance(base)).toBe(2500);
  });

  it("refuses a window shorter than a fortnight", () => {
    expect(impliedMaintenance({ ...base, windowDays: 13, loggedDays: 13 })).toBeNull();
  });

  it("refuses patchy logging rather than guessing the gaps", () => {
    expect(impliedMaintenance({ ...base, loggedDays: 20 })).toBeNull(); // 71% covered
    expect(impliedMaintenance({ ...base, loggedDays: 23, consumedKcal: 2000 * 23 })).not.toBeNull(); // 82%
  });

  it("returns null rather than an inhuman number", () => {
    expect(impliedMaintenance({ ...base, lbChange: -40 })).toBeNull();
  });

  it("reads a gain as maintenance being lower than intake", () => {
    expect(impliedMaintenance({ ...base, lbChange: +2 })).toBe(1750);
  });
});

describe("effectiveMaintenance", () => {
  it("lets a number you typed beat everything", () => {
    expect(effectiveMaintenance({ manual: 2900, implied: 2800, formula: 2500 }))
      .toEqual({ value: 2900, source: "manual" });
  });

  it("prefers the data to the formula", () => {
    expect(effectiveMaintenance({ manual: null, implied: 2800, formula: 2500 }))
      .toEqual({ value: 2800, source: "implied" });
  });

  it("falls back to the formula, then to nothing", () => {
    expect(effectiveMaintenance({ manual: null, implied: null, formula: 2500 }))
      .toEqual({ value: 2500, source: "formula" });
    expect(effectiveMaintenance({ manual: null, implied: null, formula: null }))
      .toEqual({ value: null, source: null });
  });
});

describe("burnDown", () => {
  // 40 lb to lose is 140,000 kcal of work.
  const goal = { baselineLb: 200, goalLb: 160 };

  it("sizes the job at 3,500 kcal a pound", () => {
    const b = burnDown({ ...goal, cumulativeDeficitKcal: 0, latestLb: null });
    expect(b.totalKcal).toBe(140_000);
    expect(b.remainingKcal).toBe(140_000);
    expect(b.pctComplete).toBe(0);
  });

  it("counts down as the deficit banks up", () => {
    const b = burnDown({ ...goal, cumulativeDeficitKcal: 13_600, latestLb: null });
    expect(b.remainingKcal).toBe(126_400);
    expect(b.lbByCalories).toBe(3.9);
    expect(b.burnedByScaleKcal).toBeNull();
  });

  it("shows the scale disagreeing with the food log", () => {
    // Calories say 3.9 lb gone; the scale says 5. Maintenance is underestimated.
    const b = burnDown({ ...goal, cumulativeDeficitKcal: 13_600, latestLb: 195 });
    expect(b.lbByScale).toBe(5);
    expect(b.burnedByScaleKcal).toBe(17_500);
    expect(b.gapKcal).toBe(3_900);
  });

  it("never counts past done or below zero", () => {
    const b = burnDown({ ...goal, cumulativeDeficitKcal: 200_000, latestLb: 155 });
    expect(b.remainingKcal).toBe(0);
    expect(b.pctComplete).toBe(100);
  });
});

describe("impliedWindow", () => {
  // Helper: every day in [from, from+n) is logged.
  function logged(from: string, n: number): Set<string> {
    const out = new Set<string>();
    const d = new Date(from + "T00:00:00Z");
    for (let i = 0; i < n; i++) {
      out.add(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return out;
  }
  const none = new Set<string>();

  it("finds a fully-logged stretch bracketed by weigh-ins", () => {
    const w = impliedWindow(["2026-07-01", "2026-07-20"], logged("2026-07-01", 20), none);
    expect(w).not.toBeNull();
    expect(w!.start).toBe("2026-07-01");
    expect(w!.end).toBe("2026-07-20");
    expect(w!.days.length).toBe(20);
  });

  it("rejects a stretch with an unlogged hole", () => {
    const days = logged("2026-07-01", 20);
    days.delete("2026-07-10");
    expect(impliedWindow(["2026-07-01", "2026-07-20"], days, none)).toBeNull();
  });

  it("a not-tracked day breaks the stretch instead of averaging in", () => {
    const untracked = new Set(["2026-07-10"]);
    expect(
      impliedWindow(["2026-07-01", "2026-07-20"], logged("2026-07-01", 20), untracked),
    ).toBeNull();
  });

  it("falls back to a shorter clean stretch between other weigh-ins", () => {
    // Hole on 7/10 kills 7/1→7/20 and 7/1→7/16, but 7/12→7/28 is clean.
    const days = logged("2026-07-01", 31);
    days.delete("2026-07-10");
    const w = impliedWindow(
      ["2026-07-01", "2026-07-12", "2026-07-16", "2026-07-28"],
      days,
      none,
    );
    expect(w).not.toBeNull();
    expect(w!.start).toBe("2026-07-12");
    expect(w!.end).toBe("2026-07-28");
  });

  it("needs 15 calendar days inclusive — two weeks between readings", () => {
    expect(impliedWindow(["2026-07-01", "2026-07-14"], logged("2026-07-01", 14), none)).toBeNull();
    expect(impliedWindow(["2026-07-01", "2026-07-15"], logged("2026-07-01", 15), none)).not.toBeNull();
  });
});
