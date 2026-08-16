import { describe, expect, it } from "vitest";
import {
  calendarWeeks, cumulativeDeficit, dailyRate, dailyTotals, judgeWeek,
  latestLoggedWeek, verdictFor, winsRows, winStreak,
  type DiaryEntry, type WeekVerdict,
} from "../progress";

// A Thursday, so the current week is Aug 2–8 with 5 days elapsed.
const TODAY = "2026-08-06";
const BANK = 14_000; // 2,000/day
const TOL = 500;

/** Log `kcal` every day from `from` for `days` days. */
function logDays(from: string, days: number, kcal: number, proteinG: number | null = null): DiaryEntry[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(from + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), kcal, proteinG };
  });
}

describe("calendarWeeks", () => {
  it("buckets the diary into Sunday weeks from the first entry to today", () => {
    const weeks = calendarWeeks(logDays("2026-07-26", 12, 2000), TODAY);
    expect(weeks.map((w) => w.weekOf)).toEqual(["2026-07-26", "2026-08-02"]);
    expect(weeks[0].weekEnd).toBe("2026-08-01");
  });

  it("keeps a week with nothing logged instead of closing the gap", () => {
    const entries = [...logDays("2026-07-19", 7, 2000), ...logDays("2026-08-02", 3, 2000)];
    const weeks = calendarWeeks(entries, TODAY);
    expect(weeks.map((w) => w.weekOf)).toEqual(["2026-07-19", "2026-07-26", "2026-08-02"]);
    expect(weeks[1].loggedDays).toBe(0);
  });

  it("counts only elapsed days in the week still running", () => {
    const weeks = calendarWeeks(logDays("2026-08-02", 5, 2000), TODAY);
    const current = weeks.at(-1)!;
    expect(current.inProgress).toBe(true);
    expect(current.elapsedDays).toBe(5); // Sun–Thu
    expect(current.accounted).toBe(true);
  });

  it("counts a day twice-logged once", () => {
    const weeks = calendarWeeks(
      [
        { date: "2026-08-03", kcal: 600, proteinG: 30 },
        { date: "2026-08-03", kcal: 900, proteinG: 40 },
      ],
      TODAY,
    );
    expect(weeks[0].loggedDays).toBe(1);
    expect(weeks[0].consumedKcal).toBe(1500);
    expect(weeks[0].proteinTotalG).toBe(70);
  });

  it("is empty with no diary at all", () => {
    expect(calendarWeeks([], TODAY)).toEqual([]);
  });
});

describe("judgeWeek", () => {
  it("calls exactly ±tolerance on target, inclusive", () => {
    expect(judgeWeek(BANK - 500, BANK, TOL)).toBe("on_target");
    expect(judgeWeek(BANK + 500, BANK, TOL)).toBe("on_target");
  });

  it("flags a pound-plus either side", () => {
    expect(judgeWeek(BANK - 501, BANK, TOL)).toBe("under");
    expect(judgeWeek(BANK + 501, BANK, TOL)).toBe("over");
  });
});

describe("verdictFor", () => {
  const opts = { bankKcal: BANK, toleranceKcal: TOL, maintenanceKcal: 2500, direction: "lose" as const };

  it("measures a finished week against the whole bank", () => {
    const [week] = calendarWeeks(logDays("2026-07-26", 7, 1900), TODAY);
    const v = verdictFor(week, opts);
    expect(v.bankSoFarKcal).toBe(BANK);
    expect(v.consumedKcal).toBe(13_300);
    expect(v.bankDelta).toBe(700);
    expect(v.band).toBe("under");
    expect(v.isWin).toBe(true); // under the bank is still a win
    expect(v.avgKcalPerLoggedDay).toBe(1900);
  });

  it("measures the running week against its logged days, not the full bank", () => {
    const weeks = calendarWeeks(logDays("2026-08-02", 5, 2000), TODAY);
    const v = verdictFor(weeks.at(-1)!, opts);
    expect(v.bankSoFarKcal).toBe(10_000); // 5/7 of the bank
    expect(v.bankDelta).toBe(0);
    expect(v.band).toBe("on_target");
  });

  it("refuses to judge a week with a day missing, and only banks logged days", () => {
    // Six days logged in a finished week: the seventh is unknown, not zero.
    const [week] = calendarWeeks(logDays("2026-07-26", 6, 2000), TODAY);
    const v = verdictFor(week, opts);
    expect(v.accounted).toBe(false);
    expect(v.isWin).toBeNull();
    // The comparison runs over six days of bank, not seven — the missing day
    // contributes nothing to either side.
    expect(v.bankSoFarKcal).toBe(12_000); // 14,000 × 6/7
    expect(v.bankDelta).toBe(0);
    expect(v.band).toBe("on_target");
  });

  it("shows nothing at all for a week with zero logged days", () => {
    // A single stale entry creates the week range; the empty week inside it
    // must not read as a giant deficit (the 0/1-days-logged bug).
    const entries = [...logDays("2026-07-19", 7, 1900), ...logDays("2026-08-02", 5, 1900)];
    const weeks = calendarWeeks(entries, TODAY);
    const empty = weeks.find((w) => w.weekOf === "2026-07-26")!;
    const v = verdictFor(empty, opts);
    expect(v.loggedDays).toBe(0);
    expect(v.bankSoFarKcal).toBeNull();
    expect(v.bankDelta).toBeNull();
    expect(v.band).toBeNull();
    expect(v.isWin).toBeNull();
  });

  it("excludes not-tracked days from every number", () => {
    // Sat off (vacation): its entries vanish from totals, the bank scales to
    // the six tracked days, and the week can still be judged.
    const entries = logDays("2026-07-26", 7, 2000); // includes Sat 8/1
    const untracked = new Set(["2026-08-01"]);
    const [week] = calendarWeeks(entries, TODAY, untracked);
    expect(week.loggedDays).toBe(6);
    expect(week.untrackedDays).toBe(1);
    expect(week.consumedKcal).toBe(12_000); // Sat's 2,000 not counted
    expect(week.accounted).toBe(true);
    const v = verdictFor(week, opts);
    expect(v.bankSoFarKcal).toBe(12_000); // 14,000 × 6/7
    expect(v.isWin).toBe(true);
  });

  it("a not-tracked day is not a logged day: no double credit", () => {
    // Only 5 logged + 1 untracked + 1 unknown → still not judgeable.
    const entries = logDays("2026-07-26", 5, 2000);
    const untracked = new Set(["2026-07-31"]);
    const [week] = calendarWeeks(entries, TODAY, untracked);
    expect(week.accounted).toBe(false); // Sat 8/1 is unknown
    expect(verdictFor(week, opts).isWin).toBeNull();
  });

  it("has no verdict at all without a bank", () => {
    const [week] = calendarWeeks(logDays("2026-07-26", 7, 2000), TODAY);
    const v = verdictFor(week, { ...opts, bankKcal: null });
    expect(v.bankDelta).toBeNull();
    expect(v.band).toBeNull();
    expect(v.isWin).toBeNull();
  });

  it("turns the deficit against maintenance into pounds", () => {
    const [week] = calendarWeeks(logDays("2026-07-26", 7, 2000), TODAY);
    const v = verdictFor(week, opts);
    expect(v.deficitKcal).toBe(3500); // (2500 − 2000) × 7
    expect(v.lbEquivalent).toBe(1);
  });

  it("counts the deficit only over days actually logged", () => {
    const [week] = calendarWeeks(logDays("2026-07-26", 3, 2000), TODAY);
    expect(verdictFor(week, opts).deficitKcal).toBe(1500); // not 3,500
  });
});

describe("winStreak", () => {
  function verdicts(entries: DiaryEntry[], bank = BANK): WeekVerdict[] {
    return calendarWeeks(entries, TODAY).map((w) =>
      verdictFor(w, { bankKcal: bank, toleranceKcal: TOL, maintenanceKcal: 2500, direction: "lose" }),
    );
  }

  it("counts finished wins back from the most recent", () => {
    // Three clean weeks, then the week in progress.
    const entries = [
      ...logDays("2026-07-12", 21, 1900),
      ...logDays("2026-08-02", 5, 1900),
    ];
    expect(winStreak(verdicts(entries))).toBe(3);
  });

  it("ignores the week in progress, good or bad", () => {
    const entries = [...logDays("2026-07-26", 7, 1900), ...logDays("2026-08-02", 5, 5000)];
    expect(winStreak(verdicts(entries))).toBe(1);
  });

  it("breaks on a week over the bank", () => {
    const entries = [...logDays("2026-07-19", 7, 1900), ...logDays("2026-07-26", 7, 2600)];
    expect(winStreak(verdicts(entries))).toBe(0);
  });

  it("breaks on a week that can't be scored", () => {
    const entries = [...logDays("2026-07-19", 7, 1900), ...logDays("2026-07-26", 4, 1900)];
    expect(winStreak(verdicts(entries))).toBe(0);
  });
});

describe("cumulativeDeficit", () => {
  it("adds up every week, the running one included", () => {
    const weeks = calendarWeeks(
      [...logDays("2026-07-26", 7, 2000), ...logDays("2026-08-02", 5, 2000)],
      TODAY,
    ).map((w) => verdictFor(w, { bankKcal: BANK, toleranceKcal: TOL, maintenanceKcal: 2500, direction: "lose" }));
    expect(cumulativeDeficit(weeks)).toBe(3500 + 2500); // 7 days + 5 days at −500
  });
});

describe("dailyTotals", () => {
  const ctx = { today: "2026-08-06", untracked: new Set(["2026-08-04"]) };

  it("tells the four day states apart", () => {
    const out = dailyTotals(
      ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-07"],
      [{ date: "2026-08-03", kcal: 600, proteinG: 20 }],
      ctx,
    );
    expect(out.map((d) => d.state)).toEqual(["logged", "untracked", "empty", "future"]);
    expect(out[0]).toMatchObject({ kcal: 600, proteinG: 20 });
  });

  it("a logged untracked day still reads untracked — the mark wins", () => {
    const out = dailyTotals(
      ["2026-08-04"],
      [{ date: "2026-08-04", kcal: 900, proteinG: null }],
      ctx,
    );
    expect(out[0].state).toBe("untracked");
  });
});

describe("dailyRate", () => {
  it("divides the bank by the days the week actually covers", () => {
    expect(dailyRate(10000, 5)).toBe(2000);
  });
  it("is null without a bank", () => {
    expect(dailyRate(null, 7)).toBeNull();
  });
});

describe("direction-aware wins", () => {
  function week(kcalPerDay: number) {
    return calendarWeeks(logDays("2026-07-26", 7, kcalPerDay), TODAY)[0];
  }
  const base = { bankKcal: BANK, toleranceKcal: TOL, maintenanceKcal: null };

  it("a gainer's bank is a floor: eating past it is the win", () => {
    // 2,100/day = 14,700 ≥ 14,000 − 500 → win for a gainer, loss for a loser.
    const w = week(2100);
    expect(verdictFor(w, { ...base, direction: "gain" }).isWin).toBe(true);
    expect(verdictFor(w, { ...base, direction: "lose" }).isWin).toBe(false);
  });

  it("a gainer under-eating is the loss", () => {
    // 1,800/day = 12,600 < 13,500 → gainer misses; loser wins.
    const w = week(1800);
    expect(verdictFor(w, { ...base, direction: "gain" }).isWin).toBe(false);
    expect(verdictFor(w, { ...base, direction: "lose" }).isWin).toBe(true);
  });

  it("a maintainer wins only inside the band, both edges inclusive", () => {
    expect(verdictFor(week(1929), { ...base, direction: "maintain" }).isWin).toBe(true); // 13,503
    expect(verdictFor(week(2071), { ...base, direction: "maintain" }).isWin).toBe(true); // 14,497
    expect(verdictFor(week(1900), { ...base, direction: "maintain" }).isWin).toBe(false); // 13,300 — 700 under
    expect(verdictFor(week(2100), { ...base, direction: "maintain" }).isWin).toBe(false); // 14,700 — 700 over
  });
});

describe("protein honesty", () => {
  const opts = { bankKcal: BANK, toleranceKcal: TOL, maintenanceKcal: null, direction: "lose" as const };

  it("a day with one protein-less entry drops out of the average entirely", () => {
    const entries = [
      { date: "2026-07-26", kcal: 500, proteinG: 100 },
      { date: "2026-07-27", kcal: 500, proteinG: 200 },
      { date: "2026-07-27", kcal: 300, proteinG: null }, // poisons the 27th
    ];
    const [w] = calendarWeeks(entries, TODAY);
    expect(w.proteinDays).toBe(1);
    expect(w.proteinTotalG).toBe(100);
    expect(verdictFor(w, opts).proteinPerLoggedDay).toBe(100); // not (300/2)=150 nor 100/2
  });

  it("a week with no protein-complete days averages to null, not zero", () => {
    const entries = [{ date: "2026-07-26", kcal: 500, proteinG: null }];
    const [w] = calendarWeeks(entries, TODAY);
    expect(verdictFor(w, opts).proteinPerLoggedDay).toBeNull();
  });
});

describe("missedDays", () => {
  it("never counts today, does count earlier holes", () => {
    // Logged Sun–Tue, nothing since; today is Thu. Wed missed, Thu not (yet).
    const weeks = calendarWeeks(logDays("2026-08-02", 3, 2000), TODAY);
    expect(weeks.at(-1)!.missedDays).toBe(1);
  });

  it("an untracked day is not a missed day", () => {
    const weeks = calendarWeeks(
      logDays("2026-08-02", 3, 2000), TODAY, new Set(["2026-08-05"]),
    );
    expect(weeks.at(-1)!.missedDays).toBe(0);
  });
});

describe("latestLoggedWeek", () => {
  it("skips an empty current week back to real data", () => {
    const entries = logDays("2026-07-26", 7, 2000); // nothing this week
    const weeks = calendarWeeks(entries, TODAY);
    expect(latestLoggedWeek(weeks)!.weekOf).toBe("2026-07-26");
  });

  it("null when nothing was ever logged", () => {
    expect(latestLoggedWeek([])).toBeNull();
  });
});

describe("winsRows", () => {
  const opts = { bankKcal: BANK, toleranceKcal: TOL, maintenanceKcal: null, direction: "lose" as const };
  function verdicts(entries: DiaryEntry[], untracked = new Set<string>()) {
    return calendarWeeks(entries, TODAY, untracked).map((w) => verdictFor(w, opts));
  }

  it("marks the empty current week as new-week instead of a scored row", () => {
    const { rows } = winsRows(verdicts(logDays("2026-07-26", 7, 2000)));
    expect(rows[0]).toMatchObject({ kind: "new-week", weekOf: "2026-08-02" });
    expect(rows[1].kind).toBe("week");
  });

  it("collapses a stretch of empty weeks into one gap row", () => {
    const entries = [...logDays("2026-07-05", 7, 2000), ...logDays("2026-08-02", 3, 2000)];
    const { rows } = winsRows(verdicts(entries));
    // newest first: current (logged) week, gap of 3 empty weeks, then the old week
    expect(rows.map((r) => r.kind)).toEqual(["week", "gap", "week"]);
    expect(rows[1]).toMatchObject({ kind: "gap", weeks: 3 });
  });

  it("labels a fully-untracked week as time off, not a gap", () => {
    const off = new Set(
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date("2026-07-26T00:00:00Z");
        d.setUTCDate(d.getUTCDate() + i);
        return d.toISOString().slice(0, 10);
      }),
    );
    const entries = [...logDays("2026-07-19", 7, 2000), ...logDays("2026-08-02", 3, 2000)];
    const { rows } = winsRows(verdicts(entries, off));
    expect(rows.map((r) => r.kind)).toEqual(["week", "off-week", "week"]);
  });

  it("caps scored weeks and counts the overflow", () => {
    const entries: DiaryEntry[] = [];
    for (let i = 0; i < 16; i++) {
      const d = new Date("2026-08-02T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - 7 * i);
      entries.push(...logDays(d.toISOString().slice(0, 10), 7, 2000));
    }
    const { rows, olderCount } = winsRows(verdicts(entries), { maxWeeks: 12 });
    expect(rows.filter((r) => r.kind === "week").length).toBe(12);
    expect(olderCount).toBe(4);
  });
});
