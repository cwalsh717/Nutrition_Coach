import { describe, expect, it } from "vitest";
import { dbDateToKey, keyToDbDate, localDateKey } from "../dates";

// The explicit-zone path makes the rollover bug testable deterministically:
// the same instant is Saturday in New York and Sunday in UTC, and the key
// must follow the user's zone. Fallback-path contracts hold in any test TZ.

describe("localDateKey", () => {
  it("formats with zero padding", () => {
    // Local-noon construction keeps this date stable in any test timezone.
    expect(localDateKey(new Date(2026, 0, 5, 12, 0, 0))).toBe("2026-01-05");
  });

  it("uses the LOCAL calendar day, not UTC's", () => {
    const lateEvening = new Date(2026, 7, 15, 23, 30, 0); // local Aug 15, 11:30 PM
    expect(localDateKey(lateEvening)).toBe("2026-08-15"); // never Aug 16
  });

  it("follows the user's zone: 8:06 PM Eastern is still Saturday", () => {
    // The observed bug moment — 2026-08-16T00:06Z is Sat Aug 15 in New York.
    const moment = new Date("2026-08-16T00:06:00Z");
    expect(localDateKey(moment, "America/New_York")).toBe("2026-08-15");
    expect(localDateKey(moment, "UTC")).toBe("2026-08-16");
    expect(localDateKey(moment, "Asia/Tokyo")).toBe("2026-08-16"); // 9:06 AM Sun
  });

  it("shrugs off a garbage zone from a tampered cookie", () => {
    const moment = new Date(2026, 0, 5, 12, 0, 0);
    expect(localDateKey(moment, "Not/AZone")).toBe("2026-01-05"); // server fallback
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
