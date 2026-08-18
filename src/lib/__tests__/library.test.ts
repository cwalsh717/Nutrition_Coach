import { describe, expect, it } from "vitest";
import {
  filterLibrary,
  matchesQuery,
  normalizeSearch,
  tapToLogOrder,
  type FoodLike,
  type LibraryFilters,
  type RecipeLike,
} from "../library";

describe("normalizeSearch", () => {
  it("folds case and trims", () => {
    expect(normalizeSearch("  Chicken Thighs  ")).toBe("chicken thighs");
  });

  it("collapses internal runs of whitespace", () => {
    expect(normalizeSearch("rice\t\n  cakes")).toBe("rice cakes");
  });

  it("strips accents so an unaccented search still finds them", () => {
    expect(normalizeSearch("Crème Brûlée")).toBe("creme brulee");
  });

  it("leaves an empty string empty", () => {
    expect(normalizeSearch("")).toBe("");
    expect(normalizeSearch("   ")).toBe("");
  });
});

describe("matchesQuery", () => {
  it("matches everything on a blank query — an empty box hides nothing", () => {
    expect(matchesQuery(["anything"], "")).toBe(true);
    expect(matchesQuery(["anything"], "   ")).toBe(true);
  });

  it("matches mid-word substrings, case-insensitively", () => {
    expect(matchesQuery(["Chipotle chicken bowl", ""], "chick")).toBe(true);
    expect(matchesQuery(["Chipotle chicken bowl", ""], "CHICK")).toBe(true);
  });

  it("is diacritic-insensitive in both directions", () => {
    expect(matchesQuery(["Crème Brûlée", ""], "creme")).toBe(true);
    expect(matchesQuery(["Creme Brulee", ""], "crème")).toBe(true);
  });

  it("requires every token", () => {
    expect(matchesQuery(["Chipotle chicken bowl", ""], "chicken bowl")).toBe(true);
    expect(matchesQuery(["Chipotle chicken bowl", ""], "chicken pizza")).toBe(false);
  });

  it("lets tokens land in different haystacks", () => {
    // name holds "burrito", serving note holds "beans"
    expect(matchesQuery(["Bean burrito", "black beans, rice"], "burrito beans")).toBe(true);
  });
});

describe("filterLibrary", () => {
  const recipes: RecipeLike[] = [
    { id: "r1", name: "Chicken thighs", slot: "simple_lunch", keeper: true },
    { id: "r2", name: "Oat pancakes", slot: "breakfast", keeper: null },
    { id: "r3", name: "Beef chili", slot: "main", keeper: false },
  ];
  const foods: FoodLike[] = [
    { id: "g1", name: "Iced tea", kind: "grocery", servingNote: "" },
    { id: "g2", name: "Beef jerky", kind: "grocery", servingNote: "" },
    { id: "q1", name: "Chipotle bowl", kind: "quick_eat", servingNote: "chicken, rice, beans" },
  ];
  const base: LibraryFilters = { query: "", type: "all", keeper: "all", slot: "" };
  const run = (over: Partial<LibraryFilters> = {}) =>
    filterLibrary({ recipes, foods }, { ...base, ...over });

  it("splits foods by kind and keeps the incoming order", () => {
    const out = run();
    expect(out.recipes.map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
    expect(out.groceries.map((f) => f.id)).toEqual(["g1", "g2"]);
    expect(out.takeout.map((f) => f.id)).toEqual(["q1"]);
    expect(out.total).toBe(6);
  });

  it("collapses to one section per type chip", () => {
    expect(run({ type: "recipes" })).toMatchObject({ groceries: [], takeout: [], total: 3 });
    expect(run({ type: "groceries" }).recipes).toEqual([]);
    expect(run({ type: "groceries" }).total).toBe(2);
    expect(run({ type: "takeout" }).takeout.map((f) => f.id)).toEqual(["q1"]);
    expect(run({ type: "takeout" }).total).toBe(1);
  });

  it("maps the keeper filter onto the tri-state column", () => {
    expect(run({ keeper: "keeper" }).recipes.map((r) => r.id)).toEqual(["r1"]);
    expect(run({ keeper: "unrated" }).recipes.map((r) => r.id)).toEqual(["r2"]);
    expect(run({ keeper: "retired" }).recipes.map((r) => r.id)).toEqual(["r3"]);
  });

  it("never lets keeper or slot narrow the food sections", () => {
    const out = run({ keeper: "keeper", slot: "breakfast" });
    expect(out.recipes).toEqual([]); // r1 is a keeper but not breakfast
    expect(out.groceries).toHaveLength(2);
    expect(out.takeout).toHaveLength(1);
  });

  it("narrows recipes by slot", () => {
    expect(run({ slot: "main" }).recipes.map((r) => r.id)).toEqual(["r3"]);
  });

  it("applies one query across all three sections at once", () => {
    const out = run({ query: "beef" });
    expect(out.recipes.map((r) => r.id)).toEqual(["r3"]);
    expect(out.groceries.map((f) => f.id)).toEqual(["g2"]);
    expect(out.takeout).toEqual([]);
    expect(out.total).toBe(2);
  });

  it("searches a recipe by its slot label, not just its name", () => {
    expect(run({ query: "breakfast" }).recipes.map((r) => r.id)).toEqual(["r2"]);
    expect(run({ query: "simple lunch" }).recipes.map((r) => r.id)).toEqual(["r1"]);
  });

  it("searches a food by its serving note", () => {
    expect(run({ query: "black beans" }).total).toBe(0);
    expect(run({ query: "rice beans" }).takeout.map((f) => f.id)).toEqual(["q1"]);
  });

  it("reports total 0 when nothing matches", () => {
    const out = run({ query: "zzzz" });
    expect(out).toMatchObject({ recipes: [], groceries: [], takeout: [], total: 0 });
  });

  it("keeps a pinned row visible through a query that would hide it", () => {
    // The card being edited must not vanish as the user types in the search box.
    const out = run({ query: "zzzz", pinnedIds: ["g1"] });
    expect(out.groceries.map((f) => f.id)).toEqual(["g1"]);
    expect(out.total).toBe(1);
  });

  it("does not let a pin override the type or keeper filters", () => {
    expect(run({ type: "recipes", pinnedIds: ["g1"] }).groceries).toEqual([]);
    expect(run({ keeper: "keeper", pinnedIds: ["r3"] }).recipes.map((r) => r.id)).toEqual(["r1"]);
  });
});

describe("tapToLogOrder", () => {
  const item = (id: string, kind: "quick_eat" | "grocery" | "recipe", kcal: number | null) =>
    ({ id, kind, kcal }) as const;

  it("ranks takeout, then groceries, then recipes", () => {
    const out = tapToLogOrder([
      item("recipe", "recipe", 520),
      item("grocery", "grocery", 90),
      item("takeout", "quick_eat", 700),
    ]);
    expect(out.map((i) => i.id)).toEqual(["takeout", "grocery", "recipe"]);
  });

  it("sinks anything without saved calories to the end, whatever its kind", () => {
    const out = tapToLogOrder([
      item("no-kcal takeout", "quick_eat", null),
      item("recipe", "recipe", 520),
      item("no-kcal grocery", "grocery", null),
      item("takeout", "quick_eat", 700),
    ]);
    expect(out.map((i) => i.id)).toEqual([
      "takeout",
      "recipe",
      "no-kcal takeout",
      "no-kcal grocery",
    ]);
  });

  it("preserves the incoming (name-sorted) order inside a rank", () => {
    const out = tapToLogOrder([
      item("apple", "grocery", 95),
      item("banana", "grocery", 105),
      item("cherries", "grocery", 77),
    ]);
    expect(out.map((i) => i.id)).toEqual(["apple", "banana", "cherries"]);
  });

  it("handles an empty library", () => {
    expect(tapToLogOrder([])).toEqual([]);
  });
});
