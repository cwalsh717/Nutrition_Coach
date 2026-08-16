import "server-only";
import { z } from "zod";
import { DEPARTMENTS, SLOTS } from "@/lib/constants";
import { anthropic, extractJson, firstText, friendlyClaudeError, MODEL } from "./client";

// Zod plays the role pydantic did in v1: coerce, bound, and default every
// field so a slightly-off parse never reaches the database.
const ingredientSchema = z.object({
  name: z.string().trim().min(1),
  qty: z.coerce.number().nullable().catch(null),
  unit: z.string().trim().catch(""),
  department: z.enum(DEPARTMENTS).catch("Other"),
  staple_hint: z.coerce.boolean().catch(false),
});

const recipeSchema = z.object({
  name: z.string().trim().min(1),
  servings: z.coerce.number().int().min(1).catch(4),
  kcal_per_serving: z.coerce.number().int().min(0).catch(0),
  protein_g: z.coerce.number().int().min(0).catch(0),
  carbs_g: z.coerce.number().int().min(0).catch(0),
  fat_g: z.coerce.number().int().min(0).catch(0),
  slot: z.enum(SLOTS).catch("main"),
  ingredients: z.array(ingredientSchema).min(1),
});

export type ParsedRecipe = z.infer<typeof recipeSchema>;

const INGEST_PROMPT = `You are a recipe parser. The user pastes recipe text (often a
YouTube meal-prep video description). Extract it into JSON.

Return ONLY a JSON object — no markdown fences, no commentary — with exactly this shape:

{
  "name": string,                      // short recipe title
  "servings": integer,                 // servings/portions the recipe makes
  "kcal_per_serving": integer,
  "protein_g": integer,                // grams per serving
  "carbs_g": integer,                  // grams per serving
  "fat_g": integer,                    // grams per serving
  "slot": one of ${JSON.stringify(SLOTS)},
  "ingredients": [
    {
      "name": string,                  // ingredient, without the quantity
      "qty": number or null,           // null when "to taste" or unmeasured
      "unit": string,                  // "g", "lb", "cup", "tbsp", "" for count-based
      "department": one of ${JSON.stringify(DEPARTMENTS)},
      "staple_hint": boolean           // true for items people usually keep on hand
                                       // (salt, spices, oils, common condiments)
    }
  ]
}

Rules:
- If the text states per-serving macros, use them. Otherwise estimate realistically.
  Do NOT lowball oil and fat: count every tablespoon of oil (~120 kcal, 14 g fat) and
  all butter, cheese, and sauces at full value.
- Macros are PER SERVING, not for the whole batch.
- If servings aren't stated, infer from portion language (meal-prep recipes are usually 4-6).
- Department is the section of a US supermarket where the item is found.
- "slot" is usually "main" for meal-prep recipes unless clearly breakfast/snack/shake.
- "staple_hint" is a hint, not a decision — the user reviews everything.`;

export type ParseResult =
  | { ok: true; recipe: ParsedRecipe }
  | { ok: false; error: string };

/**
 * Never throws. A failure comes back as {ok:false, error} so the ingest form
 * can re-render with the user's paste untouched.
 */
export async function parseRecipe(rawText: string): Promise<ParseResult> {
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: INGEST_PROMPT,
      messages: [{ role: "user", content: rawText }],
    });
    const parsed = recipeSchema.safeParse(extractJson(firstText(response.content)));
    if (!parsed.success) {
      return { ok: false, error: "The parse came back incomplete — try again, or trim the pasted text down to the recipe portion." };
    }
    return { ok: true, recipe: parsed.data };
  } catch (error) {
    return { ok: false, error: friendlyClaudeError(error) };
  }
}
