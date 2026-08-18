"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { candidateRows, getWeekFull, todayIso } from "@/lib/queries";
import { classifyDepartment } from "@/lib/claude/classify-department";
import { DEPARTMENTS, type Department } from "@/lib/constants";
import { isEmptyPlan, reconcileList } from "@/lib/list-reconcile";
import { mergeRows } from "@/lib/shopping";
import { freezeReason } from "@/lib/weeks";

/** Load a week for list work. The freeze is the ONLY gate: the list is
 *  editable exactly as long as the week is. */
async function editableWeek(weekId: string) {
  const user = await requireUser();
  const week = await getWeekFull(user.id, weekId);
  if (!week) throw new Error("Week not found.");
  const frozen = freezeReason(week, await todayIso());
  if (frozen) {
    throw new Error(
      frozen === "done"
        ? "This week is closed — its list is history now."
        : "This week has passed — its list is history now.",
    );
  }
  return { user, week };
}

function normalized(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Make the derived rows mirror the week's recipes. Runs on every Plan-page
 * load of an editable week; idempotent, so it writes nothing when nothing
 * changed. Manual rows and every Have/Need answer survive by construction
 * (lib/list-reconcile.ts). Frozen weeks never get here — their rows are the
 * snapshot of the list that was shopped.
 *
 * Returns true when it wrote, so the page knows to re-read the rows.
 */
export async function reconcileWeekList(weekId: string): Promise<boolean> {
  const { week } = await editableWeek(weekId);

  const derived = mergeRows(candidateRows(week));
  const plan = reconcileList(
    derived,
    week.listItems.map((item) => ({
      id: item.id,
      name: item.name,
      qty: item.qty,
      unit: item.unit,
      department: item.department,
      sources: item.sources,
      likelyHave: item.likelyHave,
      status: item.status,
      manual: item.manual,
    })),
  );
  if (isEmptyPlan(plan)) return false;

  const maxSort = Math.max(0, ...week.listItems.map((i) => i.sortOrder));
  await db.$transaction([
    ...(plan.deleteIds.length > 0
      ? [db.shoppingListItem.deleteMany({ where: { id: { in: plan.deleteIds }, weekId: week.id } })]
      : []),
    ...plan.updates.map((u) =>
      db.shoppingListItem.update({ where: { id: u.id }, data: u.data }),
    ),
    ...(plan.creates.length > 0
      ? [db.shoppingListItem.createMany({
          data: plan.creates.map((item, i) => ({
            weekId: week.id,
            ...item,
            sortOrder: maxSort + 1 + i,
          })),
        })]
      : []),
  ]);
  return true;
}

export async function setItemStatus(itemId: string, status: "have" | "need") {
  const user = await requireUser();
  const item = await db.shoppingListItem.findUnique({
    where: { id: itemId },
    include: { week: true },
  });
  if (!item || item.week.userId !== user.id) return;
  if (freezeReason(item.week, await todayIso())) return;
  await db.shoppingListItem.update({ where: { id: itemId }, data: { status } });
  revalidatePath("/week");
}

export async function markRemaining(weekId: string, status: "have" | "need") {
  const { week } = await editableWeek(weekId);
  await db.shoppingListItem.updateMany({
    where: { weekId: week.id, status: "unreviewed" },
    data: { status },
  });
  revalidatePath("/week");
}

/**
 * The wing-it add: a name, maybe a note ("2 boxes"), and it's on the list as
 * Need — adding it IS the Have/Need answer. The department comes from the
 * classifier after the response has gone out; a failure leaves "Other" and
 * never blocks or loses the save.
 */
export async function addManualItem(weekId: string, formData: FormData) {
  const { user, week } = await editableWeek(weekId);
  const name = String(formData.get("name") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!name) return;

  const created = await db.shoppingListItem.create({
    data: { weekId: week.id, name, note, manual: true, status: "need" },
  });
  after(async () => {
    const result = await classifyDepartment(name, note);
    if (!result.ok || result.department === "Other") return;
    // Guarded update: if the user already moved the line, their call stands.
    await db.shoppingListItem.updateMany({
      where: { id: created.id, week: { userId: user.id }, department: "Other" },
      data: { department: result.department },
    });
  });
  revalidatePath("/week");
}

/**
 * One-tap add of a shopping-tagged food. Tapping again is a visible no-op:
 * the chip reads as already-added while a manual row with the food's name is
 * on the list.
 */
export async function addFoodItem(weekId: string, stapleId: string) {
  const { user, week } = await editableWeek(weekId);
  const food = await db.staple.findFirst({
    where: { id: stapleId, userId: user.id, kind: "grocery" },
  });
  if (!food) return;
  const already = week.listItems.some(
    (item) => item.manual && normalized(item.name) === normalized(food.name),
  );
  if (already) return;
  await db.shoppingListItem.create({
    data: {
      weekId: week.id,
      name: food.name,
      department: food.department,
      manual: true,
      status: "need",
    },
  });
  revalidatePath("/week");
}

/** Manual rows are the user's to remove. Derived rows have no remove — they
 *  mirror the plan, and leave when their recipe does. */
export async function removeManualItem(itemId: string) {
  const user = await requireUser();
  const item = await db.shoppingListItem.findUnique({
    where: { id: itemId },
    include: { week: true },
  });
  if (!item || !item.manual || item.week.userId !== user.id) return;
  if (freezeReason(item.week, await todayIso())) return;
  await db.shoppingListItem.delete({ where: { id: itemId } });
  revalidatePath("/week");
}

/**
 * Move a line to another department, and make the fix stick beyond this week:
 * a shopping-tagged food or a recipe ingredient with the same name gets the
 * same correction, so future weeks are born right. Reconciliation never
 * writes departments, so the corrected line itself can never be overwritten.
 */
export async function setItemDepartment(itemId: string, department: string) {
  if (!(DEPARTMENTS as readonly string[]).includes(department)) return;
  const user = await requireUser();
  const item = await db.shoppingListItem.findUnique({
    where: { id: itemId },
    include: { week: true },
  });
  if (!item || item.week.userId !== user.id) return;
  if (freezeReason(item.week, await todayIso())) return;

  await db.$transaction([
    db.shoppingListItem.update({
      where: { id: item.id },
      data: { department: department as Department },
    }),
    db.staple.updateMany({
      where: {
        userId: user.id,
        kind: "grocery",
        name: { equals: item.name.trim(), mode: "insensitive" },
      },
      data: { department: department as Department },
    }),
    db.ingredient.updateMany({
      where: {
        recipe: { userId: user.id },
        name: { equals: item.name.trim(), mode: "insensitive" },
      },
      data: { department: department as Department },
    }),
  ]);
  revalidatePath("/week");
  revalidatePath("/library");
}
