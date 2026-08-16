"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { keyToDbDate, localDateKey } from "@/lib/dates";
import { requireUser } from "@/lib/session";
import { todayIso } from "@/lib/queries";
import { isWeekEditable } from "@/lib/weeks";
import { z } from "zod";

// Every field optional — empty string means "clear it". The user owns every number.
const profileSchema = z.object({
  goalType: z.enum(["lose", "gain", "maintain", "eat_cleaner"]).nullable(),
  sex: z.enum(["male", "female"]).nullable(),
  age: z.coerce.number().int().min(13).max(120).nullable(),
  heightIn: z.coerce.number().int().min(36).max(96).nullable(),
  weightLb: z.coerce.number().int().min(50).max(1000).nullable(),
  goalWeightLb: z.coerce.number().int().min(50).max(1000).nullable(),
  activityLevel: z.enum(["sedentary", "light", "moderate", "very", "extra"]).nullable(),
  weeklyKcalBudget: z.coerce.number().int().min(3500).max(70000).nullable(),
  // Null is meaningful here: it means "work my maintenance out for me".
  maintenanceKcal: z.coerce.number().int().min(1000).max(6000).nullable(),
  bankToleranceKcal: z.coerce.number().int().min(0).max(5000),
  proteinLowGDay: z.coerce.number().int().min(0).max(500).nullable(),
  proteinHighGDay: z.coerce.number().int().min(0).max(500).nullable(),
  aboutMe: z.string().max(4000),
});

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const s = (value ?? "").toString().trim();
  return s === "" ? null : s;
}

export async function saveProfile(formData: FormData) {
  const user = await requireUser();
  const result = profileSchema.safeParse({
    goalType: emptyToNull(formData.get("goalType")),
    sex: emptyToNull(formData.get("sex")),
    age: emptyToNull(formData.get("age")),
    heightIn: emptyToNull(formData.get("heightIn")),
    weightLb: emptyToNull(formData.get("weightLb")),
    goalWeightLb: emptyToNull(formData.get("goalWeightLb")),
    activityLevel: emptyToNull(formData.get("activityLevel")),
    weeklyKcalBudget: emptyToNull(formData.get("weeklyKcalBudget")),
    maintenanceKcal: emptyToNull(formData.get("maintenanceKcal")),
    bankToleranceKcal: emptyToNull(formData.get("bankToleranceKcal")) ?? 500,
    proteinLowGDay: emptyToNull(formData.get("proteinLowGDay")),
    proteinHighGDay: emptyToNull(formData.get("proteinHighGDay")),
    aboutMe: (formData.get("aboutMe") ?? "").toString(),
  });
  if (!result.success) {
    throw new Error("One of the profile numbers isn't valid — check the fields and try again.");
  }
  const parsed = result.data;

  await db.profile.update({ where: { userId: user.id }, data: parsed });

  // New targets flow into every week that hasn't finished — a plan you're
  // still living should follow your profile, not the day it was created.
  // Done weeks keep the numbers they actually ran under.
  await syncOpenWeekTargets(user.id, parsed);

  revalidatePath("/profile");
  revalidatePath("/week");
  revalidatePath("/track");
  revalidatePath("/progress");
}

async function syncOpenWeekTargets(
  userId: string,
  targets: { weeklyKcalBudget: number | null; proteinLowGDay: number | null; proteinHighGDay: number | null },
) {
  // Every week, filtered by the ONE freeze predicate — a lapsed week's bank is
  // what it was judged against, and changing today's target must not rewrite it.
  const candidates = await db.week.findMany({
    where: { userId },
    select: { id: true, weekOf: true, dayCount: true, status: true },
  });
  const today = await todayIso();
  const openWeeks = candidates.filter((w) => isWeekEditable(w, today));
  // Row by row because partial weeks prorate the bank by their day count.
  for (const week of openWeeks) {
    await db.week.update({
      where: { id: week.id },
      data: {
        budgetKcal:
          targets.weeklyKcalBudget === null
            ? null
            : Math.round((targets.weeklyKcalBudget / 7) * week.dayCount),
        proteinLowGDay: targets.proteinLowGDay,
        proteinHighGDay: targets.proteinHighGDay,
      },
    });
  }
}

/** Final step of the onboarding wizard. */
export async function completeOnboarding(formData: FormData) {
  const user = await requireUser();
  await saveProfileFields(user.id, formData);
  await db.profile.update({
    where: { userId: user.id },
    data: { onboardedAt: new Date() },
  });

  // The weight they just typed doubles as the first weigh-in, so the goal
  // burn-down has a starting point from day one.
  const weightLb = Number(String(formData.get("weightLb") ?? "").trim());
  if (Number.isFinite(weightLb) && weightLb >= 50 && weightLb <= 1000) {
    // Local "today" for the key; UTC midnight for the stored @db.Date value.
    const day = keyToDbDate(localDateKey());
    await db.weightEntry.upsert({
      where: { userId_date: { userId: user.id, date: day } },
      create: { userId: user.id, date: day, weightLb },
      update: {}, // an existing reading for today wins over the form
    });
  }

  redirect("/week");
}

async function saveProfileFields(userId: string, formData: FormData) {
  const result = profileSchema.safeParse({
    goalType: emptyToNull(formData.get("goalType")),
    sex: emptyToNull(formData.get("sex")),
    age: emptyToNull(formData.get("age")),
    heightIn: emptyToNull(formData.get("heightIn")),
    weightLb: emptyToNull(formData.get("weightLb")),
    goalWeightLb: emptyToNull(formData.get("goalWeightLb")),
    activityLevel: emptyToNull(formData.get("activityLevel")),
    weeklyKcalBudget: emptyToNull(formData.get("weeklyKcalBudget")),
    maintenanceKcal: emptyToNull(formData.get("maintenanceKcal")),
    bankToleranceKcal: emptyToNull(formData.get("bankToleranceKcal")) ?? 500,
    proteinLowGDay: emptyToNull(formData.get("proteinLowGDay")),
    proteinHighGDay: emptyToNull(formData.get("proteinHighGDay")),
    aboutMe: (formData.get("aboutMe") ?? "").toString(),
  });
  if (!result.success) {
    throw new Error("One of the profile numbers isn't valid — check the fields and try again.");
  }
  await db.profile.update({ where: { userId }, data: result.data });
}

/** Rename the account (shown in the app and used by onboarding greetings). */
export async function updateAccountName(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 100) return;
  await db.user.update({ where: { id: user.id }, data: { name } });
  revalidatePath("/profile");
}
