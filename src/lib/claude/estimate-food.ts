import "server-only";
import { z } from "zod";
import { anthropic, extractJson, firstText, friendlyClaudeError, MODEL } from "./client";

// The diary advisor: turn "PB&J on wheat and a glass of milk" into numbers.
// The result PREFILLS the entry form — the user always reviews before saving.

const estimateSchema = z.object({
  kcal: z.coerce.number().int().min(0),
  protein_g: z.coerce.number().int().min(0).catch(0),
  carbs_g: z.coerce.number().int().min(0).catch(0),
  fat_g: z.coerce.number().int().min(0).catch(0),
  note: z.string().catch(""),
});

export type FoodEstimate = z.infer<typeof estimateSchema>;

const ESTIMATE_PROMPT = `You estimate calories and macros for a food diary. The user
describes what they ate in plain words; portions may be vague.

Return ONLY a JSON object — no fences, no commentary:

{
  "kcal": integer,        // realistic total for everything described
  "protein_g": integer,
  "carbs_g": integer,
  "fat_g": integer,
  "note": string          // one short sentence stating the portion assumptions you made,
                          // e.g. "Assumed 2 tbsp peanut butter and 8 oz 2% milk."
}

Rules:
- Estimate the WHOLE description as one total.
- Use typical American portions when unstated, and say so in the note.
- Do not lowball spreads, oils, dressings, or drinks — they carry real calories.`;

export type EstimateResult =
  | { ok: true; estimate: FoodEstimate }
  | { ok: false; error: string };

export async function estimateFood(description: string): Promise<EstimateResult> {
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: ESTIMATE_PROMPT,
      messages: [{ role: "user", content: description }],
    });
    const parsed = estimateSchema.safeParse(extractJson(firstText(response.content)));
    if (!parsed.success) {
      return { ok: false, error: "Couldn't get a clean estimate — try describing the food a bit differently." };
    }
    return { ok: true, estimate: parsed.data };
  } catch (error) {
    return { ok: false, error: friendlyClaudeError(error) };
  }
}
