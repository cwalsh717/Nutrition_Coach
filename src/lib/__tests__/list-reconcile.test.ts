import { describe, expect, it } from "vitest";
import { isEmptyPlan, reconcileList, type PersistedRow } from "../list-reconcile";
import type { MergedItem } from "../shopping";

function derived(overrides: Partial<MergedItem> = {}): MergedItem {
  return {
    name: "chicken thighs",
    qty: 2,
    unit: "lb",
    department: "Meat & Seafood",
    sources: ["Chicken tinga"],
    likelyHave: false,
    ...overrides,
  };
}

let nextId = 0;
function persisted(overrides: Partial<PersistedRow> = {}): PersistedRow {
  return {
    id: `row-${nextId++}`,
    name: "chicken thighs",
    qty: 2,
    unit: "lb",
    department: "Meat & Seafood",
    sources: ["Chicken tinga"],
    likelyHave: false,
    status: "unreviewed",
    manual: false,
    ...overrides,
  };
}

/** Apply a plan to rows the way the action does, so idempotence is testable. */
function apply(rows: PersistedRow[], plan: ReturnType<typeof reconcileList>): PersistedRow[] {
  const deleted = new Set(plan.deleteIds);
  const updates = new Map(plan.updates.map((u) => [u.id, u.data]));
  return [
    ...rows
      .filter((r) => !deleted.has(r.id))
      .map((r) => (updates.has(r.id) ? { ...r, ...updates.get(r.id) } : r)),
    ...plan.creates.map((c) => persisted({ ...c, status: "unreviewed", manual: false })),
  ];
}

describe("reconcileList", () => {
  it("creates rows for new derived items and nothing else", () => {
    const plan = reconcileList([derived()], []);
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0]).toEqual({
      name: "chicken thighs",
      qty: 2,
      unit: "lb",
      department: "Meat & Seafood",
      sources: ["Chicken tinga"],
      likelyHave: false,
    });
    expect(plan.updates).toHaveLength(0);
    expect(plan.deleteIds).toHaveLength(0);
  });

  it("updates qty on a portion change and PRESERVES the Have/Need answer", () => {
    const row = persisted({ status: "have" });
    const plan = reconcileList([derived({ qty: 3 })], [row]);
    expect(plan.updates).toEqual([{ id: row.id, data: { qty: 3 } }]);
    // status never appears in an update — the answer survives.
    expect(plan.creates).toHaveLength(0);
    expect(plan.deleteIds).toHaveLength(0);
  });

  it("preserves a corrected department — reconciliation never writes it", () => {
    // User moved the line to Frozen; the ingredient still says Meat & Seafood.
    const row = persisted({ department: "Frozen" });
    const plan = reconcileList([derived()], [row]);
    expect(isEmptyPlan(plan)).toBe(true);
  });

  it("deletes derived rows whose recipe left the plan", () => {
    const gone = persisted({ name: "cotija", unit: "oz", sources: ["Removed recipe"] });
    const stays = persisted();
    const plan = reconcileList([derived()], [gone, stays]);
    expect(plan.deleteIds).toEqual([gone.id]);
    expect(plan.creates).toHaveLength(0);
    expect(plan.updates).toHaveLength(0);
  });

  it("never creates, updates, or deletes manual rows", () => {
    const manualEggs = persisted({ name: "eggs", qty: 2, unit: "", manual: true, status: "need" });
    const manualOrphan = persisted({ name: "paper towels", qty: null, manual: true, status: "need" });
    // Plan implies eggs too — same identity as the manual row.
    const plan = reconcileList([derived({ name: "eggs", qty: 12, unit: "" })], [manualEggs, manualOrphan]);
    // The manual row is invisible: the derived eggs get their OWN row...
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0].qty).toBe(12);
    // ...and no manual row is updated or deleted, matching plan or not.
    expect(plan.updates).toHaveLength(0);
    expect(plan.deleteIds).toHaveLength(0);
  });

  it("never merges a food/manual row into a recipe ingredient (the 14-eggs bug is extinct)", () => {
    // 2 cartons of eggs added by hand + 12 eggs from a recipe stay two lines.
    const cartons = persisted({ name: "eggs", qty: 2, unit: "", manual: true, status: "need" });
    let rows = [cartons];
    rows = apply(rows, reconcileList([derived({ name: "eggs", qty: 12, unit: "" })], rows));
    expect(rows).toHaveLength(2);
    const manualRow = rows.find((r) => r.manual)!;
    expect(manualRow.qty).toBe(2); // untouched, not 14
    expect(rows.find((r) => !r.manual)!.qty).toBe(12);
  });

  it("keys on name + unit + null-vs-numeric qty, like mergeRows", () => {
    const toTaste = persisted({ name: "salt", qty: null, unit: "" });
    // A numeric salt line is a different identity: create it, keep the null one
    // only if the plan still implies it (here it doesn't → deleted).
    const plan = reconcileList([derived({ name: "Salt", qty: 1, unit: "" })], [toTaste]);
    expect(plan.creates).toHaveLength(1);
    expect(plan.deleteIds).toEqual([toTaste.id]);
  });

  it("is idempotent: applying the plan then reconciling again is a no-op", () => {
    const items = [
      derived(),
      derived({ name: "eggs", qty: 12, unit: "", sources: ["Breakfast bake"], likelyHave: false }),
      derived({ name: "salt", qty: null, unit: "", likelyHave: true }),
    ];
    let rows: PersistedRow[] = [
      persisted({ status: "need", qty: 1 }), // qty will update, status survives
      persisted({ name: "gone-item", sources: ["Old recipe"] }), // will delete
      persisted({ name: "paper towels", qty: null, manual: true, status: "need" }),
    ];
    const first = reconcileList(items, rows);
    expect(isEmptyPlan(first)).toBe(false);
    rows = apply(rows, first);
    expect(isEmptyPlan(reconcileList(items, rows))).toBe(true);
    expect(rows.find((r) => r.name === "chicken thighs")!.status).toBe("need");
  });

  it("updates sources and likelyHave when contributors change", () => {
    const row = persisted({ likelyHave: true, sources: ["Chicken tinga"] });
    const plan = reconcileList(
      [derived({ sources: ["Chicken tinga", "Tacos"], likelyHave: false })],
      [row],
    );
    expect(plan.updates).toEqual([
      { id: row.id, data: { sources: ["Chicken tinga", "Tacos"], likelyHave: false } },
    ]);
  });
});
