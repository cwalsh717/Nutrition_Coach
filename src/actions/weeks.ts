"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { freezeReason, weekEnd } from "@/lib/weeks";
import { todayIso } from "@/lib/queries";

function revalidateWeekPages() {
  revalidatePath("/week");
  revalidatePath("/track");
  revalidatePath("/week/chat");
  revalidatePath("/progress");
}

/** Load a week and prove it belongs to the caller before touching it. */
async function ownedWeek(weekId: string) {
  const user = await requireUser();
  const week = await db.week.findFirst({ where: { id: weekId, userId: user.id } });
  if (!week) throw new Error("Week not found.");
  return { user, week };
}

const FROZEN_DONE =
  "This week is closed — its numbers are history.";
const FROZEN_PAST =
  "This week has passed — its numbers are history now. If the dates were wrong, re-date it.";

/** The refusal that matches WHY the week is frozen. */
function frozenError(reason: "done" | "passed"): Error {
  return new Error(reason === "done" ? FROZEN_DONE : FROZEN_PAST);
}

/** ownedWeek + the freeze (status OR the calendar). Every week-content write
 *  goes through one of these guards; the UI hiding a button is never the real
 *  gate. `today` is read here so no call site has to thread it. */
async function editableOwnedWeek(weekId: string) {
  const loaded = await ownedWeek(weekId);
  const frozen = freezeReason(loaded.week, await todayIso());
  if (frozen) throw frozenError(frozen);
  return loaded;
}

/**
 * Re-dating is the ONE thing a lapsed week still allows — it's the only fix
 * for a week created with the wrong dates, and a week that freezes with no
 * escape is a trap. A week closed in the old stage system stays closed.
 */
async function redatableOwnedWeek(weekId: string) {
  const loaded = await ownedWeek(weekId);
  if (loaded.week.status === "done") throw new Error(FROZEN_DONE);
  return loaded;
}

/** A week's recipe row, owned and on an editable week — or null. */
async function ownedEditableWeekRecipe(weekRecipeId: string) {
  const user = await requireUser();
  const wr = await db.weekRecipe.findUnique({
    where: { id: weekRecipeId },
    include: { week: true },
  });
  if (!wr || wr.week.userId !== user.id) return null;
  const frozen = freezeReason(wr.week, await todayIso());
  if (frozen) throw frozenError(frozen);
  return wr;
}

/** The weekly target, prorated for however many days this week covers. */
function proratedBank(weeklyBank: number | null, dayCount: number): number | null {
  return weeklyBank === null ? null : Math.round((weeklyBank / 7) * dayCount);
}

/**
 * Start a week. Multiple weeks can be open at once — meal prep means planning
 * next week while this one is still being eaten.
 */
export async function createWeek(formData: FormData) {
  const user = await requireUser();
  const weekOf = String(formData.get("weekOf") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekOf)) throw new Error("Pick a start date.");
  const dayCount = Math.min(7, Math.max(1, Number(formData.get("dayCount")) || 7));

  // A week that already ended would be born frozen — created and instantly
  // uneditable. Starting mid-past is fine as long as it still covers today.
  if (weekEnd(weekOf, dayCount) < (await todayIso())) {
    throw new Error("That week already ended. Pick a start date that still includes today.");
  }

  const profile = await db.profile.findUnique({ where: { userId: user.id } });
  const created = await db.week.create({
    data: {
      userId: user.id,
      weekOf: new Date(weekOf + "T00:00:00Z"),
      dayCount,
      budgetKcal: proratedBank(profile?.weeklyKcalBudget ?? null, dayCount),
      proteinLowGDay: profile?.proteinLowGDay ?? null,
      proteinHighGDay: profile?.proteinHighGDay ?? null,
    },
  });
  revalidateWeekPages();
  redirect(`/week?w=${created.id}`);
}

/** Re-date a week you labelled wrong, and/or change how many days it covers. */
export async function updateWeekDates(formData: FormData) {
  const weekId = String(formData.get("weekId") ?? "");
  const { user, week } = await redatableOwnedWeek(weekId);

  const weekOf = String(formData.get("weekOf") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekOf)) throw new Error("Pick a start date.");
  const dayCount = Math.min(7, Math.max(1, Number(formData.get("dayCount")) || week.dayCount));

  // A live week re-prorates from the current profile (matches
  // syncOpenWeekTargets). A lapsed week carries its OWN weekly rate along —
  // fixing its dates must not hand it today's target retroactively.
  const wasFrozen = freezeReason(week, await todayIso()) !== null;
  let weeklyRate: number | null;
  if (wasFrozen) {
    weeklyRate =
      week.budgetKcal === null ? null : Math.round((week.budgetKcal / week.dayCount) * 7);
  } else {
    const profile = await db.profile.findUnique({ where: { userId: user.id } });
    weeklyRate = profile?.weeklyKcalBudget ?? null;
  }

  await db.week.update({
    where: { id: week.id },
    data: {
      weekOf: new Date(weekOf + "T00:00:00Z"),
      dayCount,
      budgetKcal: proratedBank(weeklyRate, dayCount),
    },
  });
  revalidateWeekPages();
}

/**
 * Delete a week created by mistake. Only an EMPTY week qualifies — no recipes
 * planned and nothing added to its list by hand. The UI hides the button on
 * non-empty weeks, but the guard lives here: hiding a button is never the gate.
 * (Derived list rows don't block: they only exist while recipes do.)
 */
export async function deleteWeek(weekId: string) {
  const { week } = await ownedWeek(weekId);
  const [recipeCount, manualCount] = await Promise.all([
    db.weekRecipe.count({ where: { weekId: week.id } }),
    db.shoppingListItem.count({ where: { weekId: week.id, manual: true } }),
  ]);
  if (recipeCount > 0 || manualCount > 0) {
    throw new Error("This week has contents — remove them before deleting it.");
  }
  await db.week.delete({ where: { id: week.id } });
  revalidateWeekPages();
  redirect("/week");
}

/* ---------------- contents ---------------- */

export async function addRecipeToWeek(weekId: string, recipeId: string, portions?: number) {
  const { user, week } = await editableOwnedWeek(weekId);
  const recipe = await db.recipe.findFirst({ where: { id: recipeId, userId: user.id } });
  if (!recipe) return;
  const safePortions =
    portions !== undefined && Number.isFinite(portions)
      ? Math.max(1, Math.round(portions))
      : recipe.servings;
  await db.weekRecipe.upsert({
    where: { weekId_recipeId: { weekId: week.id, recipeId } },
    create: { weekId: week.id, recipeId, portions: safePortions },
    update: {},
  });
  revalidateWeekPages();
  revalidatePath("/cookbook");
}

export async function updatePortions(weekRecipeId: string, portions: number) {
  // A stray keystroke is a non-event, not a crash: invalid number = no change.
  if (!Number.isFinite(portions)) return;
  const wr = await ownedEditableWeekRecipe(weekRecipeId);
  if (!wr) return;
  await db.weekRecipe.update({
    where: { id: wr.id },
    data: { portions: Math.max(1, Math.round(portions)) },
  });
  revalidateWeekPages();
}

export async function removeRecipeFromWeek(weekRecipeId: string) {
  const wr = await ownedEditableWeekRecipe(weekRecipeId);
  if (!wr) return;
  await db.weekRecipe.delete({ where: { id: wr.id } });
  revalidateWeekPages();
}

