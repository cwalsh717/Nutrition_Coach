import { describe, expect, it } from "vitest";
import {
  effectiveMaintenance, formulaMaintenance, goalProgress, impliedMaintenance,
  impliedWindow, impliedWindowProgress, steadiness, weighInSpanDays,
  weightTrendLbPerWeek,
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
  it("stays silent under two weeks of span — noise is not a trend", () => {
    // 1.5 lb swing across one day would extrapolate to 10.5 lb/week. Gated.
    expect(
      weightTrendLbPerWeek([
        { date: "2026-08-01", weightLb: 200 },
        { date: "2026-08-02", weightLb: 198.5 },
      ]),
    ).toBeNull();
    // Many points, still only 13 days of span: gated.
    expect(
      weightTrendLbPerWeek(
        Array.from({ length: 14 }, (_, i) => ({
          date: `2026-08-${String(i + 1).padStart(2, "0")}`,
          weightLb: 200 - i * 0.2,
        })),
      ),
    ).toBeNull();
  });

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
  const base = { consumedKcal: 2000 * 28, days: 28, lbChange: -4 };

  it("is average intake plus the deficit the scale proves", () => {
    // 2,000/day eaten, 4 lb off in 28 days = 14,000 kcal = 500/day.
    expect(impliedMaintenance(base)).toBe(2500);
  });

  it("refuses a window shorter than a fortnight", () => {
    expect(impliedMaintenance({ ...base, days: 13, consumedKcal: 2000 * 13 })).toBeNull();
  });

  it("returns null rather than an inhuman number", () => {
    expect(impliedMaintenance({ ...base, lbChange: -40 })).toBeNull();
  });

  it("reads a gain as maintenance being lower than intake", () => {
    expect(impliedMaintenance({ ...base, lbChange: +2 })).toBe(1750);
  });
});

describe("weighInSpanDays", () => {
  it("measures first to last in calendar days", () => {
    expect(
      weighInSpanDays([
        { date: "2026-08-01", weightLb: 200 },
        { date: "2026-08-15", weightLb: 198 },
      ]),
    ).toBe(14);
    expect(weighInSpanDays([{ date: "2026-08-01", weightLb: 200 }])).toBe(0);
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

describe("goalProgress", () => {
  const lose = { direction: "lose" as const, baselineLb: 200, goalLb: 160 };

  it("sizes the job at 3,500 kcal a pound, either direction", () => {
    const l = goalProgress({ ...lose, cumulativeDeficitKcal: 0, latestLb: null });
    expect(l.totalKcal).toBe(140_000);
    const g = goalProgress({
      direction: "gain", baselineLb: 150, goalLb: 170, cumulativeDeficitKcal: 0, latestLb: null,
    });
    expect(g.totalKcal).toBe(70_000);
  });

  it("counts down as the deficit banks up (lose)", () => {
    const b = goalProgress({ ...lose, cumulativeDeficitKcal: 13_600, latestLb: null });
    expect(b.remainingKcal).toBe(126_400);
    expect(b.lbByCalories).toBe(3.9);
    expect(b.bankedByScaleKcal).toBeNull();
  });

  it("a gainer's SURPLUS is progress: deficit counts against them", () => {
    const b = goalProgress({
      direction: "gain", baselineLb: 150, goalLb: 170,
      cumulativeDeficitKcal: -7_000, // ate 7,000 over maintenance
      latestLb: 152,
    });
    expect(b.bankedByCaloriesKcal).toBe(7_000);
    expect(b.lbByCalories).toBe(2);
    expect(b.lbByScale).toBe(2); // 150 → 152, toward the goal
    expect(b.remainingKcal).toBe(63_000);
  });

  it("moving away from the goal shows as NEGATIVE progress, not zero", () => {
    // Loser who ate over maintenance: the old bar clamped this to 0.
    const b = goalProgress({ ...lose, cumulativeDeficitKcal: -5_000, latestLb: 202 });
    expect(b.bankedByCaloriesKcal).toBe(-5_000);
    expect(b.lbByCalories).toBe(-1.4);
    expect(b.lbByScale).toBe(-2);
    expect(b.pctByCalories).toBe(0);
  });

  it("credits overshoot past the goal", () => {
    const b = goalProgress({ ...lose, cumulativeDeficitKcal: 150_000, latestLb: 157 });
    expect(b.reachedByScale).toBe(true);
    expect(b.overshootLb).toBe(3);
    expect(b.remainingKcal).toBe(0);
    expect(b.pctByCalories).toBe(100);
  });

  it("survives a zero-width goal without NaN", () => {
    const b = goalProgress({
      direction: "lose", baselineLb: 180.2, goalLb: 180, cumulativeDeficitKcal: 1000, latestLb: null,
    });
    expect(Number.isFinite(b.pctByCalories)).toBe(true);
  });
});

describe("steadiness", () => {
  it("reads drift against the band", () => {
    expect(steadiness({ baselineLb: 180, latestLb: 182.4 })).toMatchObject({
      deviationLb: 2.4, withinBand: true,
    });
    expect(steadiness({ baselineLb: 180, latestLb: 184 }).withinBand).toBe(false);
    expect(steadiness({ baselineLb: 180, latestLb: 175 }).withinBand).toBe(false);
  });

  it("waits politely for a weigh-in", () => {
    expect(steadiness({ baselineLb: 180, latestLb: null })).toMatchObject({
      deviationLb: null, withinBand: null,
    });
  });
});

describe("impliedWindowProgress", () => {
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

  it("measures the best run anchored at a weigh-in", () => {
    const p = impliedWindowProgress(["2026-08-01"], logged("2026-08-01", 7), none);
    expect(p).toEqual({ bestRunDays: 7, requiredDays: 15 });
  });

  it("an untracked day cuts the run", () => {
    const p = impliedWindowProgress(
      ["2026-08-01"], logged("2026-08-01", 10), new Set(["2026-08-05"]),
    );
    expect(p.bestRunDays).toBe(4); // Aug 1–4
  });

  it("a run not anchored at a weigh-in counts for nothing", () => {
    const p = impliedWindowProgress(["2026-08-01"], logged("2026-08-03", 10), none);
    expect(p.bestRunDays).toBe(0);
  });

  it("caps at the requirement", () => {
    const p = impliedWindowProgress(["2026-08-01"], logged("2026-08-01", 40), none);
    expect(p.bestRunDays).toBe(15);
  });

  it("no weigh-ins, no progress", () => {
    expect(impliedWindowProgress([], logged("2026-08-01", 20), none).bestRunDays).toBe(0);
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
