// Search and filtering for the Library — one page holding the Cook Book and a
// flat list of Foods. Pure functions only: the page fetches, these decide what
// shows.
//
// Foods have no categories, only CAPABILITIES derived from their own data: a
// food logs on Track because it has calories, and joins shopping because the
// user said they buy it. Nothing here is a drawer an item has to be filed into,
// which is the whole point — plenty of foods are both.
//
// Two rules worth stating out loud:
//   - Nothing here re-sorts. Rows arrive in the database's `name asc` order and
//     leave in it; sorting again in JS would quietly disagree with Postgres'
//     collation. `tapToLogOrder` sorts by rank alone and leans on the stable
//     sort to keep names in order inside a rank.
//   - A query's tokens are matched against the row's haystacks JOINED, so
//     "chicken lunch" finds a chicken recipe in the Simple lunch slot.

import { SLOT_LABELS } from "./constants";

/** Derived, never user-assigned — these read the data, they don't label it. */
export type FoodFilter = "all" | "track" | "shopping";

export interface RecipeLike {
  id: string;
  name: string;
  slot: string;
}

export interface FoodLike {
  id: string;
  name: string;
  kind: "grocery" | "quick_eat";
  servingNote: string;
  kcal: number | null;
}

export interface LibraryFilters {
  query: string;
  food: FoodFilter;
  /** Rows the query may never hide — the card the user has open for editing. */
  pinnedIds?: readonly string[];
}

/** Fold case, strip accents, collapse whitespace. "Crème Brûlée" → "creme brulee". */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Every token of `query` must appear somewhere in the joined haystacks. An
 *  empty query matches everything — a blank search box hides nothing. */
export function matchesQuery(haystacks: readonly string[], query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const hay = normalizeSearch(haystacks.join(" "));
  return q.split(" ").every((token) => hay.includes(token));
}

export interface FoodCapabilities {
  /** Has calories, so one tap on Track logs it instead of prefilling the form. */
  logsOnTrack: boolean;
  /** The user buys it at the store, so it can join a week and its list. */
  shoppingItem: boolean;
}

/**
 * What a food can DO, read straight off its columns. A food may have both, one,
 * or neither — an Uncrustable is bought by the box and logged by the unit, and
 * a name with nothing filled in yet is simply a name.
 *
 * `kcal: 0` counts as set. Blank input stores null; a typed zero is a real
 * answer ("this drink has no calories") and stays loggable.
 */
export function foodCapabilities(food: FoodLike): FoodCapabilities {
  return {
    logsOnTrack: food.kcal !== null,
    shoppingItem: food.kind === "grocery",
  };
}

export function matchesFoodFilter(food: FoodLike, filter: FoodFilter): boolean {
  if (filter === "all") return true;
  const caps = foodCapabilities(food);
  return filter === "track" ? caps.logsOnTrack : caps.shoppingItem;
}

export interface LibraryBuckets<R, F> {
  recipes: R[];
  foods: F[];
  /** Across both — drives one "nothing matches" state, not two. */
  total: number;
}

/**
 * Split the library into its two sections under the current search and filter.
 * The capability filter narrows foods only; it never touches the Cook Book.
 */
export function filterLibrary<R extends RecipeLike, F extends FoodLike>(
  input: { recipes: readonly R[]; foods: readonly F[] },
  filters: LibraryFilters,
): LibraryBuckets<R, F> {
  const pinned = new Set(filters.pinnedIds ?? []);

  const recipes = input.recipes.filter(
    (r) =>
      pinned.has(r.id) ||
      matchesQuery([r.name, SLOT_LABELS[r.slot] ?? r.slot], filters.query),
  );

  const foods = input.foods.filter((f) => {
    // The pin outranks the search box, never the capability filter — switching
    // filters is an explicit "show me something else".
    if (!matchesFoodFilter(f, filters.food)) return false;
    return pinned.has(f.id) || matchesQuery([f.name, f.servingNote], filters.query);
  });

  return { recipes, foods, total: recipes.length + foods.length };
}

export type TapKind = "quick_eat" | "grocery" | "recipe";

const TAP_RANK: Record<TapKind, number> = { quick_eat: 0, grocery: 1, recipe: 2 };

/**
 * Tap-to-log chip order on Track: foods you don't shop for first (the ones
 * logged on the fly most), then store foods, then recipes. Anything without
 * saved calories sinks to the end — those chips prefill the form rather than
 * logging, so they earn less room.
 */
export function tapToLogOrder<T extends { kind: TapKind; kcal: number | null }>(
  items: readonly T[],
): T[] {
  const rank = (item: T) => (item.kcal === null ? 3 : TAP_RANK[item.kind]);
  return [...items].sort((a, b) => rank(a) - rank(b));
}
