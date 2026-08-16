"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { nextStage, previousStage, type WeekStatus } from "@/lib/weeks";

function revalidateWeekPages() {
  revalidatePath("/week");
  revalidatePath("/week/list");
  revalidatePath("/track");
  revalidatePath("/week/chat");
  revalidatePath("/weeks");
  revalidatePath("/progress");
}

/** Load a week and prove it belongs to the caller before touching it. */
async function ownedWeek(weekId: string) {
  const user = await requireUser();
  const week = await db.week.findFirst({ where: { id: weekId, userId: user.id } });
  if (!week) throw new Error("Week not found.");
  return { user, week };
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
  const { user, week } = await ownedWeek(weekId);

  const weekOf = String(formData.get("weekOf") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekOf)) throw new Error("Pick a start date.");
  const dayCount = Math.min(7, Math.max(1, Number(formData.get("dayCount")) || week.dayCount));

  const profile = await db.profile.findUnique({ where: { userId: user.id } });
  await db.week.update({
    where: { id: week.id },
    data: {
      weekOf: new Date(weekOf + "T00:00:00Z"),
      dayCount,
      budgetKcal: proratedBank(profile?.weeklyKcalBudget ?? null, dayCount),
    },
  });
  revalidateWeekPages();
}

/** Move a week forward one stage: plan → shop → cook → done. */
export async function advanceStage(weekId: string) {
  const { week } = await ownedWeek(weekId);
  const next = nextStage(week.status as WeekStatus);
  if (!next) return;

  await db.week.update({
    where: { id: week.id },
    data: {
      status: next,
      // Entering "cooking" means the shopping is done, so stamp the list as
      // produced if the user never pressed anything explicit.
      ...(next === "cooking" && week.listFinalizedAt === null
        ? { listFinalizedAt: new Date() }
        : {}),
    },
  });
  revalidateWeekPages();
}

/** Escape hatch — nobody should be trapped in a stage they entered by mistake. */
export async function revertStage(weekId: string) {
  const { week } = await ownedWeek(weekId);
  const prev = previousStage(week.status as WeekStatus);
  if (!prev) return;
  await db.week.update({ where: { id: week.id }, data: { status: prev } });
  revalidateWeekPages();
}

export async function deleteWeek(weekId: string) {
  const { week } = await ownedWeek(weekId);
  await db.week.delete({ where: { id: week.id } });
  revalidateWeekPages();
  redirect("/week");
}

/* ---------------- contents ---------------- */

export async function addRecipeToWeek(weekId: string, recipeId: string, portions?: number) {
  const { user, week } = await ownedWeek(weekId);
  const recipe = await db.recipe.findFirst({ where: { id: recipeId, userId: user.id } });
  if (!recipe) return;
  await db.weekRecipe.upsert({
    where: { weekId_recipeId: { weekId: week.id, recipeId } },
    create: { weekId: week.id, recipeId, portions: portions ?? recipe.servings },
    update: {},
  });
  revalidateWeekPages();
  revalidatePath("/cookbook");
}

export async function updatePortions(weekRecipeId: string, portions: number) {
  const user = await requireUser();
  const wr = await db.weekRecipe.findUnique({
    where: { id: weekRecipeId },
    include: { week: true },
  });
  if (!wr || wr.week.userId !== user.id) return;
  await db.weekRecipe.update({
    where: { id: weekRecipeId },
    data: { portions: Math.max(1, Math.round(portions)) },
  });
  revalidateWeekPages();
}

export async function removeRecipeFromWeek(weekRecipeId: string) {
  const user = await requireUser();
  const wr = await db.weekRecipe.findUnique({
    where: { id: weekRecipeId },
    include: { week: true },
  });
  if (!wr || wr.week.userId !== user.id) return;
  await db.weekRecipe.delete({ where: { id: weekRecipeId } });
  revalidateWeekPages();
}

/** Snapshot-copy a staple from the library onto a week. */
export async function addStapleToWeek(weekId: string, stapleId: string, qty?: number) {
  const { user, week } = await ownedWeek(weekId);
  const staple = await db.staple.findFirst({
    where: { id: stapleId, userId: user.id, kind: "grocery" },
  });
  if (!staple) return;
  await db.weekStaple.create({
    data: {
      weekId: week.id,
      stapleId: staple.id,
      name: staple.name,
      kcal: staple.kcal,
      proteinG: staple.proteinG,
      department: staple.department,
      qty: Math.max(1, Math.round(qty ?? staple.defaultQty)),
    },
  });
  revalidateWeekPages();
}

export async function updateWeekStapleQty(weekStapleId: string, qty: number) {
  const user = await requireUser();
  const ws = await db.weekStaple.findUnique({
    where: { id: weekStapleId },
    include: { week: true },
  });
  if (!ws || ws.week.userId !== user.id) return;
  await db.weekStaple.update({
    where: { id: weekStapleId },
    data: { qty: Math.max(1, Math.round(qty)) },
  });
  revalidateWeekPages();
}

export async function removeWeekStaple(weekStapleId: string) {
  const user = await requireUser();
  const ws = await db.weekStaple.findUnique({
    where: { id: weekStapleId },
    include: { week: true },
  });
  if (!ws || ws.week.userId !== user.id) return;
  await db.weekStaple.delete({ where: { id: weekStapleId } });
  revalidateWeekPages();
}
