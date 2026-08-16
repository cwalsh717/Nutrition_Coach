"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { DEPARTMENTS } from "@/lib/constants";

function optionalInt(value: FormDataEntryValue | null): number | null {
  const s = (value ?? "").toString().trim();
  if (s === "") return null;
  const n = Math.round(Number(s));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function fieldsFromForm(formData: FormData) {
  const department = String(formData.get("department") ?? "Other");
  const kind = formData.get("kind") === "quick_eat" ? "quick_eat" : "grocery";
  return {
    name: String(formData.get("name") ?? "").trim(),
    kind: kind as "grocery" | "quick_eat",
    kcal: optionalInt(formData.get("kcal")),
    proteinG: optionalInt(formData.get("proteinG")),
    carbsG: optionalInt(formData.get("carbsG")),
    fatG: optionalInt(formData.get("fatG")),
    servingNote: String(formData.get("servingNote") ?? "").trim(),
    // Grocery-only fields; harmless defaults on quick eats.
    defaultQty: Math.max(1, Number(formData.get("defaultQty")) || 1),
    department: (DEPARTMENTS as readonly string[]).includes(department) ? department : "Other",
  };
}

function revalidateAll() {
  revalidatePath("/staples");
  revalidatePath("/week");
  revalidatePath("/week/list");
  revalidatePath("/track");
}

export async function createStaple(formData: FormData) {
  const user = await requireUser();
  const fields = fieldsFromForm(formData);
  if (!fields.name) return;
  await db.staple.create({ data: { ...fields, userId: user.id } });
  revalidateAll();
}

export async function updateStaple(stapleId: string, formData: FormData) {
  const user = await requireUser();
  const existing = await db.staple.findUnique({ where: { id: stapleId } });
  if (!existing || existing.userId !== user.id) throw new Error("Not yours.");
  const fields = fieldsFromForm(formData);
  if (!fields.name) return;
  await db.staple.update({ where: { id: stapleId }, data: fields });
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
