import { describe, expect, it } from "vitest";
import {
  filterLibrary,
  foodCapabilities,
  matchesFoodFilter,
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
    expect(matchesQuery(["Bean burrito", "black beans, rice"], "burrito beans")).toBe(true);
  });
});

const food = (over: Partial<FoodLike> = {}): FoodLike => ({
  id: "f",
  name: "Thing",
  kind: "quick_eat",
  servingNote: "",
  kcal: null,
  ...over,
});

describe("foodCapabilities", () => {
  it("gives a store food with calories both capabilities", () => {
    // The Uncrustable case: bought by the box AND logged by the unit.
    expect(foodCapabilities(food({ kind: "grocery", kcal: 210 }))).toEqual({
      logsOnTrack: true,
      shoppingItem: true,
    });
  });

  it("gives calories alone only the Track capability", () => {
    expect(foodCapabilities(food({ kind: "quick_eat", kcal: 650 }))).toEqual({
      logsOnTrack: true,
      shoppingItem: false,
    });
  });

  it("gives the store toggle alone only the shopping capability", () => {
    expect(foodCapabilities(food({ kind: "grocery", kcal: null }))).toEqual({
      logsOnTrack: false,
      shoppingItem: true,
    });
  });

  it("gives a bare name neither — a food is allowed to be just a name", () => {
    expect(foodCapabilities(food())).toEqual({ logsOnTrack: false, shoppingItem: false });
  });

  it("counts a typed zero as calories set, unlike a blank", () => {
    // optionalInt stores null for blank and 0 for "0" — "this drink has no
    // calories" is an answer, and it stays one tap to log.
    expect(foodCapabilities(food({ kcal: 0 })).logsOnTrack).toBe(true);
    expect(foodCapabilities(food({ kcal: null })).logsOnTrack).toBe(false);
  });
});

describe("matchesFoodFilter", () => {
  it("passes everything under All, including a food with no capabilities", () => {
    expect(matchesFoodFilter(food(), "all")).toBe(true);
    expect(matchesFoodFilter(food({ kind: "grocery", kcal: 90 }), "all")).toBe(true);
  });

  it("selects Track items on calories, whatever the store toggle says", () => {
    expect(matchesFoodFilter(food({ kind: "grocery", kcal: 90 }), "track")).toBe(true);
    expect(matchesFoodFilter(food({ kind: "quick_eat", kcal: 90 }), "track")).toBe(true);
    expect(matchesFoodFilter(food({ kind: "grocery", kcal: null }), "track")).toBe(false);
  });

  it("selects Shopping items on the store toggle, whatever the calories say", () => {
    expect(matchesFoodFilter(food({ kind: "grocery", kcal: null }), "shopping")).toBe(true);
    expect(matchesFoodFilter(food({ kind: "grocery", kcal: 90 }), "shopping")).toBe(true);
    expect(matchesFoodFilter(food({ kind: "quick_eat", kcal: 90 }), "shopping")).toBe(false);
  });
});

describe("filterLibrary", () => {
  const recipes: RecipeLike[] = [
    { id: "r1", name: "Chicken thighs", slot: "simple_lunch" },
    { id: "r2", name: "Oat pancakes", slot: "breakfast" },
    { id: "r3", name: "Beef chili", slot: "main" },
  ];
  const foods: FoodLike[] = [
    { id: "g1", name: "Iced tea", kind: "grocery", servingNote: "", kcal: null },
    { id: "g2", name: "Beef jerky", kind: "grocery", servingNote: "", kcal: 80 },
    { id: "q1", name: "Chipotle bowl", kind: "quick_eat", servingNote: "chicken, rice, beans", kcal: 700 },
  ];
  const base: LibraryFilters = { query: "", food: "all" };
  const run = (over: Partial<LibraryFilters> = {}) =>
    filterLibrary({ recipes, foods }, { ...base, ...over });

  it("returns both sections in the incoming order", () => {
    const out = run();
    expect(out.recipes.map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
    expect(out.foods.map((f) => f.id)).toEqual(["g1", "g2", "q1"]);
    expect(out.total).toBe(6);
  });

  it("keeps foods in one flat list regardless of kind", () => {
    // No Groceries/Takeout split any more — kind only decides a tag.
    expect(run().foods.map((f) => f.kind)).toEqual(["grocery", "grocery", "quick_eat"]);
  });

  it("narrows foods by capability without touching the Cook Book", () => {
    const track = run({ food: "track" });
    expect(track.foods.map((f) => f.id)).toEqual(["g2", "q1"]);
    expect(track.recipes).toHaveLength(3);

    const shopping = run({ food: "shopping" });
    expect(shopping.foods.map((f) => f.id)).toEqual(["g1", "g2"]);
    expect(shopping.recipes).toHaveLength(3);
  });

  it("applies one query across both sections at once", () => {
    const out = run({ query: "beef" });
    expect(out.recipes.map((r) => r.id)).toEqual(["r3"]);
    expect(out.foods.map((f) => f.id)).toEqual(["g2"]);
    expect(out.total).toBe(2);
  });

  it("searches a recipe by its slot label, not just its name", () => {
    expect(run({ query: "breakfast" }).recipes.map((r) => r.id)).toEqual(["r2"]);
    expect(run({ query: "simple lunch" }).recipes.map((r) => r.id)).toEqual(["r1"]);
  });

  it("searches a food by its serving note", () => {
    expect(run({ query: "rice beans" }).foods.map((f) => f.id)).toEqual(["q1"]);
  });

  it("reports total 0 when nothing matches", () => {
    expect(run({ query: "zzzz" })).toMatchObject({ recipes: [], foods: [], total: 0 });
  });

  it("keeps a pinned row visible through a query that would hide it", () => {
    // The card being edited must not vanish as the user types in the search box.
    const out = run({ query: "zzzz", pinnedIds: ["g1"] });
    expect(out.foods.map((f) => f.id)).toEqual(["g1"]);
    expect(out.total).toBe(1);
  });

  it("does not let a pin override the capability filter", () => {
    // g1 has no calories, so Track items must not show it even when pinned.
    expect(run({ food: "track", pinnedIds: ["g1"] }).foods.map((f) => f.id)).toEqual(["g2", "q1"]);
  });
});

describe("tapToLogOrder", () => {
  const item = (id: string, kind: "quick_eat" | "grocery" | "recipe", kcal: number | null) =>
    ({ id, kind, kcal }) as const;

  it("ranks non-store foods, then store foods, then recipes", () => {
    const out = tapToLogOrder([
      item("recipe", "recipe", 520),
      item("grocery", "grocery", 90),
      item("quick", "quick_eat", 700),
    ]);
    expect(out.map((i) => i.id)).toEqual(["quick", "grocery", "recipe"]);
  });

  it("sinks anything without saved calories to the end, whatever its kind", () => {
    const out = tapToLogOrder([
      item("no-kcal quick", "quick_eat", null),
      item("recipe", "recipe", 520),
      item("no-kcal grocery", "grocery", null),
      item("quick", "quick_eat", 700),
    ]);
    expect(out.map((i) => i.id)).toEqual([
      "quick",
      "recipe",
      "no-kcal quick",
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
