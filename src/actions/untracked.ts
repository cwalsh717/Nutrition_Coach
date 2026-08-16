"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { keyToDbDate } from "@/lib/dates";
import { addDays } from "@/lib/weeks";
import { requireUser } from "@/lib/session";

// Not-tracked days: a deliberate "this day doesn't count" — distinct from a
// day with no entries (unknown) and from a logged 0-kcal day (a claim).
// Presence of a row excludes the day from bank math, weekly verdicts, and
// the data-implied maintenance stretch.

const KEY = /^\d{4}-\d{2}-\d{2}$/;

export async function setDayTracked(formData: FormData) {
  const user = await requireUser();
  const date = String(formData.get("date") ?? "");
  const tracked = formData.get("tracked") === "true";
  if (!KEY.test(date)) return;

  if (tracked) {
    await db.untrackedDay.deleteMany({
      where: { userId: user.id, date: keyToDbDate(date) },
    });
  } else {
    await db.untrackedDay.upsert({
      where: { userId_date: { userId: user.id, date: keyToDbDate(date) } },
      create: { userId: user.id, date: keyToDbDate(date) },
      update: {},
    });
  }
  revalidateTracking();
}

/** Mark a whole range not-tracked (vacations). Capped so a typo'd year can't
 *  write thousands of rows. */
export async function markRangeUntracked(formData: FormData) {
  const user = await requireUser();
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");
  if (!KEY.test(from) || !KEY.test(to) || from > to) return;

  const days: string[] = [];
  for (let d = from; d <= to && days.length <= 60; d = addDays(d, 1)) days.push(d);
  if (days.length > 60) return;

  await db.untrackedDay.createMany({
    data: days.map((date) => ({ userId: user.id, date: keyToDbDate(date) })),
    skipDuplicates: true,
  });
  revalidateTracking();
}

function revalidateTracking() {
  revalidatePath("/track");
  revalidatePath("/progress");
}
