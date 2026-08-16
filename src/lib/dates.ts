// The two date conversions in this app, and the rule that keeps them apart:
//
// 1. "What day is it?" — a REAL MOMENT becoming a date key. This must use
//    LOCAL time. `toISOString()` on `new Date()` answers in UTC, which flips
//    the app to tomorrow at 8 PM Eastern — the bug that closed a week early.
// 2. Date KEYS ("2026-08-15") moving to and from storage or arithmetic.
//    Keys are timezone-less. They ride in `@db.Date` columns pinned to UTC
//    midnight, so key ↔ Date conversions must stay UTC — running those
//    through local time would shift every stored key back a day.
//
// Every "now" in the app goes through localDateKey; every stored date goes
// through dbDateToKey/keyToDbDate. Nothing else touches timezones.
//
// "Local" means the USER'S timezone, not the server's: the browser announces
// its IANA zone in a cookie (see components/timezone-sync.tsx) and the server
// passes it in here. Without a zone we fall back to the server clock — only
// ever the first request from a fresh browser.

/** The date key for a real moment (default: now) in the given IANA zone,
 *  falling back to the process's local time. */
export function localDateKey(moment: Date = new Date(), timeZone?: string): string {
  if (timeZone) {
    try {
      // en-CA formats as YYYY-MM-DD, exactly our key shape.
      return new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(moment);
    } catch {
      // Unknown zone string (tampered cookie) — fall through to server time.
    }
  }
  const y = moment.getFullYear();
  const m = String(moment.getMonth() + 1).padStart(2, "0");
  const d = String(moment.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The key stored in a `@db.Date` column (Prisma returns UTC midnight). */
export function dbDateToKey(stored: Date): string {
  return stored.toISOString().slice(0, 10);
}

/** A key becoming a `@db.Date` value — UTC midnight, matching dbDateToKey. */
export function keyToDbDate(key: string): Date {
  return new Date(key + "T00:00:00Z");
}
