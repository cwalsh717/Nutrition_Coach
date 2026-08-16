// Shopping list assembly: pure functions, no DB, no React.
// Port of v1's shopping.py with one deliberate removal: there is NO pantry
// auto-stripping. Every item goes to the user for a Need/Have decision;
// `likelyHave` only sorts the review so probable-haves sit at the bottom.

import { STORE_WALK_ORDER } from "./constants";

export interface CandidateRow {
  name: string;
  qty: number | null; // null = "to taste" / unmeasured
  unit: string;
  department: string;
  source: string; // recipe name or "staple"
  likelyHave: boolean;
}

export interface MergedItem {
  name: string;
  qty: number | null;
  unit: string;
  department: string;
  sources: string[];
  likelyHave: boolean;
}

/**
 * Merge duplicate ingredients across recipes/staples.
 * Rules (unchanged from v1): merge only when normalized name AND unit match;
 * numeric quantities sum; a qty-less line never merges with a numeric one;
 * different units stay as separate lines — we never guess conversions.
 * A merged line is "likely have" only if every contributor was.
 */
export function mergeRows(rows: CandidateRow[]): MergedItem[] {
  const merged = new Map<string, MergedItem>();

  for (const row of rows) {
    const base = `${row.name.trim().toLowerCase()}|${row.unit.trim().toLowerCase()}`;
    const kind = row.qty === null ? "null" : "num";
    const key = `${base}|${kind}`;

    const existing = merged.get(key);
    if (existing) {
      if (row.qty !== null && existing.qty !== null) existing.qty += row.qty;
      existing.sources.push(row.source);
      existing.likelyHave = existing.likelyHave && row.likelyHave;
    } else {
      merged.set(key, {
        name: row.name.trim(),
        qty: row.qty,
        unit: row.unit.trim(),
        department: row.department,
        sources: [row.source],
        likelyHave: row.likelyHave,
      });
    }
  }

  return [...merged.values()].map((m) => ({
    ...m,
    qty: m.qty === null ? null : Math.round(m.qty * 100) / 100,
    sources: [...new Set(m.sources)].sort(),
  }));
}

/** Review order: likely-need first, then store-walk department, then name. */
export function reviewSort(a: MergedItem, b: MergedItem): number {
  if (a.likelyHave !== b.likelyHave) return a.likelyHave ? 1 : -1;
  const deptDiff = walkIndex(a.department) - walkIndex(b.department);
  if (deptDiff !== 0) return deptDiff;
  return a.name.localeCompare(b.name);
}

function walkIndex(department: string): number {
  const i = (STORE_WALK_ORDER as readonly string[]).indexOf(department);
  return i === -1 ? STORE_WALK_ORDER.length : i;
}

export function formatItem(item: { qty: number | null; unit: string; name: string }): string {
  if (item.qty === null) return item.name;
  // 2 -> "2", 1.5 -> "1.5" (no trailing .0)
  const qty = String(Number(item.qty.toFixed(2)));
  return [qty, item.unit, item.name].filter(Boolean).join(" ");
}

export interface DeptGroup<T> {
  department: string;
  items: T[];
}

/** Group items by department in the order you walk the store. */
export function groupByDepartment<T extends { department: string; name: string }>(
  items: T[],
): DeptGroup<T>[] {
  const byDept = new Map<string, T[]>();
  for (const item of items) {
    const list = byDept.get(item.department) ?? [];
    list.push(item);
    byDept.set(item.department, list);
  }
  const groups: DeptGroup<T>[] = [];
  for (const dept of STORE_WALK_ORDER) {
    const items = byDept.get(dept);
    if (items) {
      groups.push({
        department: dept,
        items: items.sort((a, b) => a.name.localeCompare(b.name)),
      });
    }
  }
  return groups;
}

/** Plain-text export for pasting into a ShopRite pickup order. */
export function asPlainText(
  groups: DeptGroup<{ qty: number | null; unit: string; name: string; department: string }>[],
  estimatedWeekKcal: number | null,
): string {
  const lines: string[] = [];
  for (const group of groups) {
    lines.push(`== ${group.department} ==`);
    for (const item of group.items) lines.push(formatItem(item));
    lines.push("");
  }
  if (estimatedWeekKcal !== null) {
    lines.push(`Estimated week total: ${estimatedWeekKcal.toLocaleString()} kcal`);
  }
  return lines.join("\n").trim();
}
