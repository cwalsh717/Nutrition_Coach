// Week identity and staging. Pure functions over ISO date strings so the
// labels and stage rules can be tested without a database or a clock.
//
// A week is just a start date plus how many days it covers. Which week you're
// "in" is derived from today's date — never stored — so nothing goes stale.

import { dbDateToKey } from "./dates";

export type WeekStatus = "planning" | "shopping" | "cooking" | "done";

export const STAGES: { status: WeekStatus; label: string }[] = [
  { status: "planning", label: "Plan" },
  { status: "shopping", label: "Shop" },
  { status: "cooking", label: "Cook" },
  { status: "done", label: "Done" },
];

export function stageIndex(status: WeekStatus): number {
  return STAGES.findIndex((s) => s.status === status);
}

/** "done" = you closed it. "passed" = time closed it. */
export type FreezeReason = "done" | "passed";

/** Enough of a week to judge whether it's still live. Accepts the Date that
 *  Prisma hands back as well as our own YYYY-MM-DD keys. */
export interface FreezableWeek {
  weekOf: string | Date;
  dayCount: number;
  status: WeekStatus;
}

function startKey(weekOf: string | Date): string {
  return typeof weekOf === "string" ? weekOf : dbDateToKey(weekOf);
}

/** The list is a finished artifact once shopping is behind you. */
export function isListLocked(status: WeekStatus): boolean {
  return stageIndex(status) > stageIndex("shopping");
}

/**
 * Why a week is read-only, or null if it's still live.
 *
 * Two ways a week closes: you closed it, or time did. Most weeks never get a
 * closing ceremony — they just end — so the calendar is the honest authority.
 * Through its own last day a week stays editable; it freezes at the user's
 * midnight after. Deliberately looser than isListLocked (a cooking week's
 * MEALS can still change even though its LIST is a finished artifact).
 *
 * The ONE source of truth for the freeze: never inline a status or date check
 * anywhere else.
 */
export function freezeReason(week: FreezableWeek, today: string): FreezeReason | null {
  if (week.status === "done") return "done";
  if (classify(startKey(week.weekOf), week.dayCount, today) === "past") return "passed";
  return null;
}

export function isWeekEditable(week: FreezableWeek, today: string): boolean {
  return freezeReason(week, today) === null;
}

/**
 * What to CALL a week in the UI. A lapsed week wearing a "planning" badge is a
 * carcass; a week you actually walked to done earned that word. The stored
 * status column is untouched — this is presentation only.
 */
export function displayStatus(week: FreezableWeek, today: string): WeekStatus | "closed" {
  const frozen = freezeReason(week, today);
  if (frozen === "done") return "done";
  if (frozen === "passed") return "closed";
  return week.status;
}

export function nextStage(status: WeekStatus): WeekStatus | null {
  const i = stageIndex(status);
  return i < 0 || i >= STAGES.length - 1 ? null : STAGES[i + 1].status;
}

export function previousStage(status: WeekStatus): WeekStatus | null {
  const i = stageIndex(status);
  return i <= 0 ? null : STAGES[i - 1].status;
}

/* ---------------- dates ---------------- */

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Last day the week covers (inclusive). */
export function weekEnd(weekOf: string, dayCount: number): string {
  return addDays(weekOf, Math.max(1, dayCount) - 1);
}

export function coversDate(weekOf: string, dayCount: number, date: string): boolean {
  return date >= weekOf && date <= weekEnd(weekOf, dayCount);
}

export type WhenLabel = "current" | "upcoming" | "past";

export function classify(weekOf: string, dayCount: number, today: string): WhenLabel {
  if (coversDate(weekOf, dayCount, today)) return "current";
  return weekOf > today ? "upcoming" : "past";
}

/** "Jul 26 – Aug 1" — humans don't read 2026-07-26. */
export function rangeLabel(weekOf: string, dayCount: number): string {
  const fmt = (iso: string) =>
    new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
      month: "short", day: "numeric", timeZone: "UTC",
    });
  const end = weekEnd(weekOf, dayCount);
  return end === weekOf ? fmt(weekOf) : `${fmt(weekOf)} – ${fmt(end)}`;
}

/** Short relative wording for the tab: "This week", "Next week", "In 3 weeks". */
export function relativeLabel(weekOf: string, dayCount: number, today: string): string {
  const when = classify(weekOf, dayCount, today);
  if (when === "current") return "This week";

  const days = daysBetween(today, weekOf);
  if (when === "upcoming") {
    if (days <= 7) return "Next week";
    return `In ${plural(Math.round(days / 7))}`;
  }
  const ago = daysBetween(weekEnd(weekOf, dayCount), today);
  if (ago <= 7) return "Last week";
  return `${plural(Math.round(ago / 7))} ago`;
}

/** Rounding can land on 1 (8–10 days), so both branches need the singular. */
function plural(weeks: number): string {
  return `${weeks} week${weeks === 1 ? "" : "s"}`;
}

function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso + "T00:00:00Z").getTime() - new Date(fromIso + "T00:00:00Z").getTime();
  return Math.round(ms / 86_400_000);
}

/* ---------------- which week to open ---------------- */

export interface WeekLike {
  id: string;
  weekOf: string;
  dayCount: number;
  status: WeekStatus;
}

/**
 * Which week the app should open when no specific one was asked for:
 * the week covering today, else the soonest upcoming one, else the most
 * recent past one. Returns null only when the user has no weeks at all.
 */
export function defaultWeek<T extends WeekLike>(weeks: T[], today: string): T | null {
  if (weeks.length === 0) return null;

  const current = weeks.find((w) => classify(w.weekOf, w.dayCount, today) === "current");
  if (current) return current;

  const upcoming = weeks
    .filter((w) => w.weekOf > today)
    .sort((a, b) => a.weekOf.localeCompare(b.weekOf));
  if (upcoming.length > 0) return upcoming[0];

  return [...weeks].sort((a, b) => b.weekOf.localeCompare(a.weekOf))[0];
}

/** The week you're actually eating right now — Track pins to this one. */
export function currentWeek<T extends WeekLike>(weeks: T[], today: string): T | null {
  return weeks.find((w) => coversDate(w.weekOf, w.dayCount, today)) ?? null;
}

/** Tab order: soonest first, so planning-ahead weeks sit to the right. */
export function tabOrder<T extends WeekLike>(weeks: T[]): T[] {
  return [...weeks].sort((a, b) => a.weekOf.localeCompare(b.weekOf));
}

/* ---------------- calendar weeks (for the diary) ---------------- */

/**
 * The Sunday on or before a date. The diary runs on plain calendar weeks so it
 * works every day of the year, with or without a plan — plans come and go, but
 * you always ate something yesterday.
 */
export function calendarWeekStart(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  return addDays(date, -d.getUTCDay());
}

/** The seven dates of the calendar week containing `date`. */
export function calendarWeekDays(date: string): string[] {
  const start = calendarWeekStart(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
