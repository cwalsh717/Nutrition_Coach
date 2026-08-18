// Search and filtering for the Library — one page holding recipes, groceries
// and takeout. Pure functions only: the page fetches, these decide what shows.
//
// Two rules worth stating out loud:
//   - Nothing here re-sorts. Rows arrive in the database's `name asc` order and
//     leave in it; sorting again in JS would quietly disagree with Postgres'
//     collation. `tapToLogOrder` sorts by rank alone and leans on the stable
//     sort to keep names in order inside a rank.
//   - A query's tokens are matched against the row's haystacks JOINED, so
//     "chicken lunch" finds a chicken recipe in the Simple lunch slot.

import { SLOT_LABELS } from "./constants";

export type LibraryType = "all" | "recipes" | "groceries" | "takeout";
export type KeeperFilter = "all" | "keeper" | "unrated" | "retired";

export interface RecipeLike {
  id: string;
  name: string;
  slot: string;
  keeper: boolean | null; // null = unrated, true = keeper, false = retired
}

export interface FoodLike {
  id: string;
  name: string;
  kind: "grocery" | "quick_eat";
  servingNote: string;
}

export interface LibraryFilters {
  query: string;
  type: LibraryType;
  keeper: KeeperFilter;
  /** "" = any slot. Only ever applied to recipes. */
  slot: string;
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

export interface LibraryBuckets<R, F> {
  recipes: R[];
  groceries: F[];
  takeout: F[];
  /** Across all three — drives one "nothing matches" state, not three. */
  total: number;
}

/**
 * Split the library into its three sections under the current search and
 * filters. Keeper and slot narrow recipes only; they never touch food rows.
 */
export function filterLibrary<R extends RecipeLike, F extends FoodLike>(
  input: { recipes: readonly R[]; foods: readonly F[] },
  filters: LibraryFilters,
): LibraryBuckets<R, F> {
  const pinned = new Set(filters.pinnedIds ?? []);
  const { type } = filters;

  const recipes =
    type === "all" || type === "recipes"
      ? input.recipes.filter((r) => {
          if (filters.keeper === "keeper" && r.keeper !== true) return false;
          if (filters.keeper === "retired" && r.keeper !== false) return false;
          if (filters.keeper === "unrated" && r.keeper !== null) return false;
          if (filters.slot && r.slot !== filters.slot) return false;
          if (pinned.has(r.id)) return true;
          return matchesQuery([r.name, SLOT_LABELS[r.slot] ?? r.slot], filters.query);
        })
      : [];

  const foodsOfKind = (kind: FoodLike["kind"], show: boolean) =>
    show
      ? input.foods.filter(
          (f) =>
            f.kind === kind &&
            (pinned.has(f.id) || matchesQuery([f.name, f.servingNote], filters.query)),
        )
      : [];

  const groceries = foodsOfKind("grocery", type === "all" || type === "groceries");
  const takeout = foodsOfKind("quick_eat", type === "all" || type === "takeout");

  return {
    recipes,
    groceries,
    takeout,
    total: recipes.length + groceries.length + takeout.length,
  };
}

export type TapKind = "quick_eat" | "grocery" | "recipe";

const TAP_RANK: Record<TapKind, number> = { quick_eat: 0, grocery: 1, recipe: 2 };

/**
 * Tap-to-log chip order on Track: takeout first (logged on the fly most), then
 * groceries, then recipes. Anything without saved calories sinks to the end —
 * those chips prefill the form rather than logging, so they earn less room.
 */
export function tapToLogOrder<T extends { kind: TapKind; kcal: number | null }>(
  items: readonly T[],
): T[] {
  const rank = (item: T) => (item.kcal === null ? 3 : TAP_RANK[item.kind]);
  return [...items].sort((a, b) => rank(a) - rank(b));
}
