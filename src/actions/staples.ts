"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { classifyDepartment } from "@/lib/claude/classify-department";

function optionalInt(value: FormDataEntryValue | null): number | null {
  const s = (value ?? "").toString().trim();
  if (s === "") return null;
  const n = Math.round(Number(s));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * The Library's food form, in full: a name, macros, a serving note, and the
 * store toggle behind `kind`.
 *
 * `department` and `defaultQty` are deliberately NOT read here. The form stopped
 * sending them, and this function used to read every field unconditionally —
 * so leaving them in would stamp "Other" and 1 over the stored values on every
 * save, wiping a classified department the next time the user fixed a typo.
 */
function fieldsFromForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    kind: (formData.get("kind") === "grocery" ? "grocery" : "quick_eat") as
      | "grocery"
      | "quick_eat",
    kcal: optionalInt(formData.get("kcal")),
    proteinG: optionalInt(formData.get("proteinG")),
    carbsG: optionalInt(formData.get("carbsG")),
    fatG: optionalInt(formData.get("fatG")),
    servingNote: String(formData.get("servingNote") ?? "").trim(),
  };
}

function revalidateAll() {
  revalidatePath("/library");
  revalidatePath("/week");
  revalidatePath("/week/list");
  revalidatePath("/track");
}

/**
 * Ask which aisle a store food lives in, after the response has gone out.
 *
 * Best-effort garnish: the row is already saved and the user is already looking
 * at it. Nothing here is awaited by the request, nothing surfaces an error, and
 * a failure just leaves the department at "Other".
 *
 * `userId` is captured from the caller rather than looked up in here — the
 * request context is gone by the time this runs. `updateMany` is what lets the
 * where-clause carry both the ownership check and the still-"Other" guard, so a
 * user edit that lands first is never overwritten.
 */
function classifyInBackground(
  stapleId: string,
  userId: string,
  name: string,
  servingNote: string,
) {
  after(async () => {
    const result = await classifyDepartment(name, servingNote);
    if (!result.ok || result.department === "Other") return;
    await db.staple.updateMany({
      where: { id: stapleId, userId, department: "Other" },
      data: { department: result.department },
    });
  });
}

export async function createStaple(formData: FormData) {
  const user = await requireUser();
  const fields = fieldsFromForm(formData);
  if (!fields.name) return;
  const created = await db.staple.create({ data: { ...fields, userId: user.id } });
  if (created.kind === "grocery") {
    classifyInBackground(created.id, user.id, created.name, created.servingNote);
  }
  revalidateAll();
}

export async function updateStaple(stapleId: string, formData: FormData) {
  const user = await requireUser();
  const existing = await db.staple.findUnique({ where: { id: stapleId } });
  if (!existing || existing.userId !== user.id) throw new Error("Not yours.");
  const fields = fieldsFromForm(formData);
  if (!fields.name) return;
  await db.staple.update({ where: { id: stapleId }, data: fields });
  // Covers both the toggle being flipped on and the slow heal of rows filed
  // under "Other" back when the user picked the aisle themselves.
  if (fields.kind === "grocery" && existing.department === "Other") {
    classifyInBackground(stapleId, user.id, fields.name, fields.servingNote);
  }
  revalidateAll();
}

export async function deleteStaple(stapleId: string) {
  const user = await requireUser();
  const existing = await db.staple.findUnique({ where: { id: stapleId } });
  if (!existing || existing.userId !== user.id) throw new Error("Not yours.");
  // Week snapshots keep their copied name/macros; the FK just goes null.
  await db.staple.delete({ where: { id: stapleId } });
  revalidateAll();
}
