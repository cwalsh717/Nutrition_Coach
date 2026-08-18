// Validation for the department classifier's reply. Pure, so it can be tested
// without a network call — `src/lib/claude/classify-department.ts` is
// `server-only` and throws the moment vitest imports it.
//
// The user never picks a department. This is the seam where a model's guess
// becomes a value the shopping list can group by, so an unusable answer has to
// be recognisable as unusable rather than quietly becoming "Other".

import { z } from "zod";
import { DEPARTMENTS, type Department } from "./constants";

export const departmentReplySchema = z.object({
  // The string() is load-bearing: `z.enum(...).catch("Other")` on its own also
  // catches a MISSING key, so a reply of `{}` would parse as a confident
  // "Other". Requiring the field first keeps "said nothing" separate from
  // "said Other"; past that, an off-list department degrades to "Other" the
  // same way the ingest parse handles ingredient departments.
  department: z.string().min(1).pipe(z.enum(DEPARTMENTS).catch("Other")),
});

/**
 * A department, or null when the reply had no usable `department` field at all.
 *
 * Null and "Other" mean different things to the caller: null is "the model gave
 * us nothing", "Other" is "the model answered, and the answer was Other". Both
 * leave the stored row alone, but only null is worth distinguishing if this ever
 * grows a retry.
 */
export function parseDepartmentReply(raw: unknown): Department | null {
  const parsed = departmentReplySchema.safeParse(raw);
  return parsed.success ? parsed.data.department : null;
}
