// The live shopping list's one rule, as a pure function: derived rows mirror
// the week's recipes, manual rows belong to the user, and decisions survive.
//
// Given what the plan currently implies (mergeRows over the recipes' scaled
// ingredients) and what's persisted, produce the minimal create/update/delete
// plan. Callers apply it only to an EDITABLE week — a frozen week's rows are
// the snapshot of the list that was shopped and are never touched.
//
// Deliberately conservative:
//   - `manual` rows are invisible here: never matched, updated, or deleted.
//     (Structural consequence: a food/wing-it row never merges with a recipe
//     ingredient — the old "2 cartons + 12 eggs = 14 eggs" collision is gone.)
//   - `status` is never written: the user's Have/Need answer survives portion
//     changes and recipe additions.
//   - `department` is stamped at creation and preserved thereafter, so a
//     user's per-line correction sticks. Reconciliation updates only
//     qty/sources/likelyHave, and only when they actually changed.
//   - Same inputs twice → empty plan → zero writes.

import type { MergedItem } from "./shopping";

export interface PersistedRow {
  id: string;
  name: string;
  qty: number | null;
  unit: string;
  department: string;
  sources: string[];
  likelyHave: boolean;
  status: "unreviewed" | "have" | "need";
  manual: boolean;
}

export interface RowCreate {
  name: string;
  qty: number | null;
  unit: string;
  department: string;
  sources: string[];
  likelyHave: boolean;
}

export interface RowUpdate {
  id: string;
  data: Partial<Pick<PersistedRow, "qty" | "sources" | "likelyHave">>;
}

export interface ReconcilePlan {
  creates: RowCreate[];
  updates: RowUpdate[];
  deleteIds: string[];
}

/** Identity: normalized name + unit + the null-vs-numeric qty distinction —
 *  exactly the key mergeRows dedupes on, so one derived line maps to one row. */
function identityKey(row: { name: string; unit: string; qty: number | null }): string {
  const kind = row.qty === null ? "null" : "num";
  return `${row.name.trim().toLowerCase()}|${row.unit.trim().toLowerCase()}|${kind}`;
}

function sameSources(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}

export function reconcileList(derived: MergedItem[], persisted: PersistedRow[]): ReconcilePlan {
  const plan: ReconcilePlan = { creates: [], updates: [], deleteIds: [] };

  // Manual rows are the user's; only derived rows mirror the plan.
  const mirror = new Map<string, PersistedRow>();
  for (const row of persisted) {
    if (!row.manual) mirror.set(identityKey(row), row);
  }

  for (const item of derived) {
    const existing = mirror.get(identityKey(item));
    if (!existing) {
      plan.creates.push({
        name: item.name,
        qty: item.qty,
        unit: item.unit,
        department: item.department,
        sources: item.sources,
        likelyHave: item.likelyHave,
      });
      continue;
    }
    mirror.delete(identityKey(item)); // matched — whatever remains gets deleted
    const data: RowUpdate["data"] = {};
    if (existing.qty !== item.qty) data.qty = item.qty;
    if (!sameSources(existing.sources, item.sources)) data.sources = item.sources;
    if (existing.likelyHave !== item.likelyHave) data.likelyHave = item.likelyHave;
    if (Object.keys(data).length > 0) plan.updates.push({ id: existing.id, data });
  }

  // Derived rows whose key vanished: the recipe that justified them left.
  plan.deleteIds = [...mirror.values()].map((row) => row.id);
  return plan;
}

export function isEmptyPlan(plan: ReconcilePlan): boolean {
  return plan.creates.length === 0 && plan.updates.length === 0 && plan.deleteIds.length === 0;
}
