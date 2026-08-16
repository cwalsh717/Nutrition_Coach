"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

// Weigh-ins. One per day: saving the same date twice corrects the number
// rather than stacking two readings, because you only weigh once that morning.

export async function saveWeight(formData: FormData) {
  const user = await requireUser();

  const date = String(formData.get("date") ?? "");
  const weightLb = Number(String(formData.get("weightLb") ?? "").trim());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  // Bounds catch a fat-fingered 1850 without policing anyone's body.
  if (!Number.isFinite(weightLb) || weightLb < 50 || weightLb > 1000) return;

  const day = new Date(date + "T00:00:00Z");
  await db.weightEntry.upsert({
    where: { userId_date: { userId: user.id, date: day } },
    create: { userId: user.id, date: day, weightLb },
    update: { weightLb },
  });

  revalidateWeight();
}

export async function deleteWeight(entryId: string) {
  const user = await requireUser();
  const entry = await db.weightEntry.findFirst({ where: { id: entryId, userId: user.id } });
  if (!entry) return;
  await db.weightEntry.delete({ where: { id: entryId } });
  revalidateWeight();
}

function revalidateWeight() {
  revalidatePath("/progress");
  revalidatePath("/profile");
}
