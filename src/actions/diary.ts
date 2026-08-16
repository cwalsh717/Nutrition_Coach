"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

// Diary entries belong to the user and a date. No week is required — you can
// always log what you ate, whether or not a plan exists for that day.

function optionalInt(value: FormDataEntryValue | null): number | null {
  const s = (value ?? "").toString().trim();
  if (s === "") return null;
  const n = Math.round(Number(s));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function revalidateDiary() {
  revalidatePath("/track");
  revalidatePath("/progress");
  revalidatePath("/week");
  revalidatePath("/weeks");
}

export async function addEntry(formData: FormData) {
  const user = await requireUser();

  const date = String(formData.get("date") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const kcal = optionalInt(formData.get("kcal"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !description || kcal === null) return;

  await db.foodLogEntry.create({
    data: {
      userId: user.id,
      date: new Date(date + "T00:00:00Z"),
      description,
      kcal,
      proteinG: optionalInt(formData.get("proteinG")),
      carbsG: optionalInt(formData.get("carbsG")),
      fatG: optionalInt(formData.get("fatG")),
      source: formData.get("source") === "advisor" ? "advisor" : "manual",
    },
  });
  revalidateDiary();
}

export async function updateEntry(entryId: string, formData: FormData) {
  const user = await requireUser();
  const entry = await db.foodLogEntry.findFirst({
    where: { id: entryId, userId: user.id },
  });
  if (!entry) return;

  const description = String(formData.get("description") ?? "").trim();
  const kcal = optionalInt(formData.get("kcal"));
  if (!description || kcal === null) return;

  await db.foodLogEntry.update({
    where: { id: entryId },
    data: {
      description,
      kcal,
      proteinG: optionalInt(formData.get("proteinG")),
      carbsG: optionalInt(formData.get("carbsG")),
      fatG: optionalInt(formData.get("fatG")),
    },
  });
  revalidateDiary();
}

export async function deleteEntry(entryId: string) {
  const user = await requireUser();
  const entry = await db.foodLogEntry.findFirst({
    where: { id: entryId, userId: user.id },
  });
  if (!entry) return;
  await db.foodLogEntry.delete({ where: { id: entryId } });
  revalidateDiary();
}
