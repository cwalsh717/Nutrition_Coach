import { describe, expect, it } from "vitest";
import {
  calendarWeekDays, calendarWeekStart, classify, coversDate, currentWeek,
  defaultWeek, isListLocked, nextStage, previousStage, rangeLabel,
  relativeLabel, tabOrder, weekEnd, type WeekLike,
} from "../weeks";

const TODAY = "2026-07-31"; // a Friday

function w(id: string, weekOf: string, dayCount = 7, status: WeekLike["status"] = "planning"): WeekLike {
  return { id, weekOf, dayCount, status };
}

describe("week boundaries", () => {
  it("a 7-day week ends 6 days after it starts", () => {
    expect(weekEnd("2026-07-26", 7)).toBe("2026-08-01");
  });

  it("a 1-day week starts and ends the same day", () => {
    expect(weekEnd("2026-07-26", 1)).toBe("2026-07-26");
  });

  it("covers its first and last day, but not the day after", () => {
    expect(coversDate("2026-07-26", 7, "2026-07-26")).toBe(true);
    expect(coversDate("2026-07-26", 7, "2026-08-01")).toBe(true);
    expect(coversDate("2026-07-26", 7, "2026-08-02")).toBe(false);
  });
});

describe("classify", () => {
  it("knows the week containing today", () => {
    expect(classify("2026-07-26", 7, TODAY)).toBe("current");
  });
  it("knows a week that hasn't started", () => {
    expect(classify("2026-08-02", 7, TODAY)).toBe("upcoming");
  });
  it("knows a week that already ended", () => {
    expect(classify("2026-07-12", 7, TODAY)).toBe("past");
  });
  it("treats a short week that ended early as past, not current", () => {
    // Jul 26 + 2 days ends Jul 27 — over, even though Jul 26 is 'this' calendar week
    expect(classify("2026-07-26", 2, TODAY)).toBe("past");
  });
});

describe("labels", () => {
  it("renders a human date range", () => {
    expect(rangeLabel("2026-07-26", 7)).toBe("Jul 26 – Aug 1");
  });
  it("collapses a one-day week to a single date", () => {
    expect(rangeLabel("2026-07-26", 1)).toBe("Jul 26");
  });
  it("names weeks relative to today", () => {
    expect(relativeLabel("2026-07-26", 7, TODAY)).toBe("This week");
    expect(relativeLabel("2026-08-02", 7, TODAY)).toBe("Next week");
    expect(relativeLabel("2026-07-19", 7, TODAY)).toBe("Last week");
  });
  it("counts further-out weeks", () => {
    expect(relativeLabel("2026-08-23", 7, TODAY)).toBe("In 3 weeks");
  });
});

describe("stages", () => {
  it("advances and reverses through the four stages", () => {
    expect(nextStage("planning")).toBe("shopping");
    expect(nextStage("cooking")).toBe("done");
    expect(nextStage("done")).toBeNull();
    expect(previousStage("shopping")).toBe("planning");
    expect(previousStage("planning")).toBeNull();
  });

  it("locks the list only once shopping is behind you", () => {
    expect(isListLocked("planning")).toBe(false);
    expect(isListLocked("shopping")).toBe(false);
    expect(isListLocked("cooking")).toBe(true);
    expect(isListLocked("done")).toBe(true);
  });
});

describe("defaultWeek", () => {
  it("opens nothing when there are no weeks", () => {
    expect(defaultWeek([], TODAY)).toBeNull();
  });

  it("prefers the week covering today", () => {
    const weeks = [w("past", "2026-07-12"), w("now", "2026-07-26"), w("next", "2026-08-02")];
    expect(defaultWeek(weeks, TODAY)?.id).toBe("now");
  });

  it("falls back to the soonest upcoming week", () => {
    const weeks = [w("later", "2026-08-16"), w("soon", "2026-08-02"), w("old", "2026-07-05")];
    expect(defaultWeek(weeks, TODAY)?.id).toBe("soon");
  });

  it("falls back to the most recent past week when nothing is ahead", () => {
    const weeks = [w("older", "2026-07-05"), w("recent", "2026-07-12")];
    expect(defaultWeek(weeks, TODAY)?.id).toBe("recent");
  });
});

describe("currentWeek", () => {
  it("is the week containing today, regardless of what's selected", () => {
    const weeks = [w("next", "2026-08-02"), w("now", "2026-07-26")];
    expect(currentWeek(weeks, TODAY)?.id).toBe("now");
  });

  it("is null when today falls in a gap between weeks", () => {
    const weeks = [w("old", "2026-07-05"), w("next", "2026-08-02")];
    expect(currentWeek(weeks, TODAY)).toBeNull();
  });
});

describe("calendar weeks (the diary's own weeks)", () => {
  it("snaps back to the Sunday on or before a date", () => {
    expect(calendarWeekStart("2026-07-31")).toBe("2026-07-26"); // Fri -> Sun
    expect(calendarWeekStart("2026-08-01")).toBe("2026-07-26"); // Sat -> Sun
  });

  it("leaves a Sunday where it is", () => {
    expect(calendarWeekStart("2026-07-26")).toBe("2026-07-26");
  });

  it("gives seven consecutive days starting Sunday", () => {
    const days = calendarWeekDays("2026-07-31");
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-07-26");
    expect(days[6]).toBe("2026-08-01");
  });

  it("works with no plan in sight — it only needs a date", () => {
    expect(calendarWeekDays("2027-01-01")[0]).toBe("2026-12-27");
  });
});

describe("tabOrder", () => {
  it("sorts weeks chronologically so planning-ahead sits to the right", () => {
    const weeks = [w("c", "2026-08-09"), w("a", "2026-07-26"), w("b", "2026-08-02")];
    expect(tabOrder(weeks).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});
