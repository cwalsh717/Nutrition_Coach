import { describe, expect, it } from "vitest";
import { dbDateToKey, keyToDbDate, localDateKey } from "../dates";

// The timezone-dependent behavior (8 PM Eastern still being "today") is
// covered by the manual clock test in the patch's test plan — a unit test
// can't change the process timezone reliably. These pin the contracts that
// hold in every timezone.

describe("localDateKey", () => {
  it("formats with zero padding", () => {
    // Local-noon construction keeps this date stable in any test timezone.
    expect(localDateKey(new Date(2026, 0, 5, 12, 0, 0))).toBe("2026-01-05");
  });

  it("uses the LOCAL calendar day, not UTC's", () => {
    const lateEvening = new Date(2026, 7, 15, 23, 30, 0); // local Aug 15, 11:30 PM
    expect(localDateKey(lateEvening)).toBe("2026-08-15"); // never Aug 16
  });
});

describe("db date round-trip", () => {
  it("keys survive storage untouched in both directions", () => {
    expect(dbDateToKey(keyToDbDate("2026-08-15"))).toBe("2026-08-15");
  });

  it("keyToDbDate pins UTC midnight (what @db.Date stores)", () => {
    expect(keyToDbDate("2026-08-15").toISOString()).toBe("2026-08-15T00:00:00.000Z");
  });
});
