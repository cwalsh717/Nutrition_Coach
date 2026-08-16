"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { resolveWeek } from "@/lib/queries";
import { DEPARTMENTS, SLOTS } from "@/lib/constants";
import { parseRecipe, type ParseResult } from "@/lib/claude/parse-recipe";

/** Ingest step 1: Claude parse. Never throws — the form keeps the paste. */
export async function parseRecipeAction(rawText: string): Promise<ParseResult> {
  await requireUser();
  if (!rawText.trim()) return { ok: false, error: "Paste some recipe text first." };
  return parseRecipe(rawText);
}

// -------- shared form → data --------

interface IngredientInput {
  name: string;
  qty: number | null;
  unit: string;
  department: string;
  stapleHint: boolean;
}

function ingredientsFromForm(formData: FormData): IngredientInput[] {
  const names = formData.getAll("ingName").map(String);
  const qtys = formData.getAll("ingQty").map(String);
  const units = formData.getAll("ingUnit").map(String);
  const departments = formData.getAll("ingDepartment").map(String);
  const hints = formData.getAll("ingStapleHint").map(String);

  const rows: IngredientInput[] = [];
  for (let i = 0; i < names.length; i++) {
    const name = names[i].trim();
    if (!name) continue; // blanked-out row = deleted
    rows.push({
      name,
      qty: qtys[i]?.trim() ? Number(qtys[i]) : null,
      unit: (units[i] ?? "").trim(),
      department: (DEPARTMENTS as readonly string[]).includes(departments[i])
        ? departments[i]
        : "Other",
      stapleHint: hints[i] === "true",
    });
  }
  return rows;
}

function recipeFieldsFromForm(formData: FormData) {
  const slot = String(formData.get("slot") ?? "main");
  return {
    name: String(formData.get("name") ?? "").trim(),
    source: String(formData.get("source") ?? "").trim(),
    servings: Math.max(1, Number(formData.get("servings")) || 1),
    kcalPerServing: Math.max(0, Number(formData.get("kcalPerServing")) || 0),
    proteinG: Math.max(0, Number(formData.get("proteinG")) || 0),
    carbsG: Math.max(0, Number(formData.get("carbsG")) || 0),
    fatG: Math.max(0, Number(formData.get("fatG")) || 0),
    slot: ((SLOTS as readonly string[]).includes(slot) ? slot : "main") as
      | "main" | "breakfast" | "snack" | "shake" | "simple_lunch",
    notes: String(formData.get("notes") ?? "").trim(),
  };
}

// -------- CRUD --------

export async function createRecipe(formData: FormData) {
  const user = await requireUser();
  const fields = recipeFieldsFromForm(formData);
  if (!fields.name) throw new Error("Recipe needs a name.");
  const ingredients = ingredientsFromForm(formData);

  const recipe = await db.recipe.create({
    data: {
      ...fields,
      userId: user.id,
      rawText: String(formData.get("rawText") ?? ""),
      ingredients: {
        create: ingredients.map((ing, i) => ({ ...ing, sortOrder: i })),
      },
    },
  });

  // Optional "save and add to this week" path from the ingest review form.
  if (formData.get("addToWeek") === "true") {
    const week = await resolveWeek(user.id);
    if (week) {
      await db.weekRecipe.create({
        data: { weekId: week.id, recipeId: recipe.id, portions: fields.servings },
      });
      revalidatePath("/week");
    }
  }

  revalidatePath("/cookbook");
  redirect("/cookbook");
}

export async function updateRecipe(recipeId: string, formData: FormData) {
  const user = await requireUser();
  const existing = await db.recipe.findUnique({ where: { id: recipeId } });
  if (!existing || existing.userId !== user.id) throw new Error("Not your recipe.");

  const fields = recipeFieldsFromForm(formData);
  const ingredients = ingredientsFromForm(formData);

  // Simplest correct sync: replace all ingredient rows.
  await db.$transaction([
    db.recipe.update({ where: { id: recipeId }, data: fields }),
    db.ingredient.deleteMany({ where: { recipeId } }),
    db.ingredient.createMany({
      data: ingredients.map((ing, i) => ({ ...ing, recipeId, sortOrder: i })),
    }),
  ]);

  revalidatePath("/cookbook");
  redirect("/cookbook");
}

export async function deleteRecipe(recipeId: string) {
  const user = await requireUser();
  const existing = await db.recipe.findUnique({ where: { id: recipeId } });
  if (!existing || existing.userId !== user.id) throw new Error("Not your recipe.");
  await db.recipe.delete({ where: { id: recipeId } });
  revalidatePath("/cookbook");
}

/** keeper: true = keeper, false = retired, null = back to unrated */
export async function setKeeper(recipeId: string, keeper: boolean | null) {
  const user = await requireUser();
  const existing = await db.recipe.findUnique({ where: { id: recipeId } });
  if (!existing || existing.userId !== user.id) throw new Error("Not your recipe.");
  await db.recipe.update({ where: { id: recipeId }, data: { keeper } });
  revalidatePath("/cookbook");
}

export async function markCooked(recipeId: string) {
  const user = await requireUser();
  const existing = await db.recipe.findUnique({ where: { id: recipeId } });
  if (!existing || existing.userId !== user.id) throw new Error("Not your recipe.");
  await db.recipe.update({
    where: { id: recipeId },
    data: { timesMade: { increment: 1 }, lastMade: new Date() },
  });
  revalidatePath("/cookbook");
}
