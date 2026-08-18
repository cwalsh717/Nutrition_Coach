import "server-only";
import { DEPARTMENTS, type Department } from "@/lib/constants";
import { parseDepartmentReply } from "@/lib/departments";
import { anthropic, extractJson, firstText, friendlyClaudeError, MODEL } from "./client";

// Which aisle a food lives in — asked on the user's behalf, never of them.
// Recipe ingredients have always got their department from the ingest parse;
// this does the same job for a saved food, so the shopping list keeps its
// store-walk grouping without anyone filling in a dropdown.
//
// The schema lives in lib/departments.ts because this module is server-only and
// a test can't import it.

const CLASSIFY_PROMPT = `You sort a single grocery item into the section of a US
supermarket where a shopper would find it.

Return ONLY a JSON object — no fences, no commentary:

{
  "department": one of ${JSON.stringify(DEPARTMENTS)}
}

Rules:
- Pick the aisle the item is actually shelved in, not what it's made of:
  frozen pizza is "Frozen", canned beans are "Canned & Jarred", a bottled iced
  tea is "Beverages".
- Shelf-stable boxed and bagged goods (cereal, pasta, rice, crackers, protein
  bars) are "Pantry & Dry Goods".
- Use "Other" only when the item genuinely doesn't belong to any section, or
  isn't a grocery at all.`;

export type ClassifyResult =
  | { ok: true; department: Department }
  | { ok: false; error: string };

/**
 * Never throws. Callers treat a failure as "leave the department alone" — the
 * user's save has already happened and must not depend on this.
 */
export async function classifyDepartment(
  name: string,
  servingNote = "",
): Promise<ClassifyResult> {
  const item = servingNote.trim() ? `${name.trim()} (${servingNote.trim()})` : name.trim();
  if (!item) return { ok: false, error: "No item to classify." };

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      system: CLASSIFY_PROMPT,
      messages: [{ role: "user", content: item }],
    });
    const department = parseDepartmentReply(extractJson(firstText(response.content)));
    if (department === null) {
      return { ok: false, error: "The classifier didn't name a department." };
    }
    return { ok: true, department };
  } catch (error) {
    return { ok: false, error: friendlyClaudeError(error) };
  }
}
