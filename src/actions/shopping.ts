"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { candidateRows, getWeekFull, todayIso } from "@/lib/queries";
import { mergeRows, reviewSort } from "@/lib/shopping";
import { freezeReason, isListLocked, type WeekStatus } from "@/lib/weeks";

/** Load a week for list work, refusing once the list is a finished artifact. */
async function editableWeek(weekId: string) {
  const user = await requireUser();
  const week = await getWeekFull(user.id, weekId);
  if (!week) throw new Error("Week not found.");
  // Two locks, both real: the list finishes when shopping does, and the whole
  // week finishes when it's closed or its last day has passed.
  const frozen = freezeReason(week, await todayIso());
  if (frozen) {
    throw new Error(
      frozen === "done"
        ? "This week is closed — reopen it with Revert to change the list."
        : "This week has passed — its list is history now.",
    );
  }
  if (isListLocked(week.status as WeekStatus)) {
    throw new Error("This week's list is already done — reopen the week to change it.");
  }
  return week;
}

function revalidateListPages() {
  revalidatePath("/week/list");
  revalidatePath("/week");
  revalidatePath("/weeks");
}

/**
 * Assemble the review list from a week's recipes + staples. Rebuilding
 * replaces every item, which is why the UI warns before doing it.
 */
export async function buildShoppingList(weekId: string) {
  const week = await editableWeek(weekId);
  const items = mergeRows(candidateRows(week)).sort(reviewSort);

  await db.$transaction([
    db.shoppingListItem.deleteMany({ where: { weekId: week.id } }),
    db.shoppingListItem.createMany({
      data: items.map((item, i) => ({
        weekId: week.id,
        name: item.name,
        qty: item.qty,
        unit: item.unit,
        department: item.department,
        sources: item.sources,
        likelyHave: item.likelyHave,
        sortOrder: i,
      })),
    }),
    db.week.update({ where: { id: week.id }, data: { listBuiltAt: new Date() } }),
  ]);
  revalidateListPages();
}

export async function setItemStatus(itemId: string, status: "have" | "need") {
  const user = await requireUser();
  const item = await db.shoppingListItem.findUnique({
    where: { id: itemId },
    include: { week: true },
  });
  if (!item || item.week.userId !== user.id) return;
  if (isListLocked(item.week.status as WeekStatus)) return;
  if (freezeReason(item.week, await todayIso())) return;
  await db.shoppingListItem.update({ where: { id: itemId }, data: { status } });
  revalidatePath("/week/list");
}

/**
 * Finish planning: build the list and move the week into shopping in one go.
 * Two separate clicks for one intention was the old friction.
 */
export async function startShopping(weekId: string) {
  const week = await editableWeek(weekId);
  if (week.recipes.length === 0 && week.staples.length === 0) return;

  await buildShoppingList(week.id);
  await db.week.update({ where: { id: week.id }, data: { status: "shopping" } });
  revalidateListPages();
  redirect(`/week/list?w=${week.id}`);
}

export async function markRemaining(weekId: string, status: "have" | "need") {
  const week = await editableWeek(weekId);
  await db.shoppingListItem.updateMany({
    where: { weekId: week.id, status: "unreviewed" },
    data: { status },
  });
  revalidatePath("/week/list");
}
