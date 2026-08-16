// Shared vocabulary. Departments are US-supermarket sections; STORE_WALK_ORDER
// is the order you actually walk one (produce first, frozen near the end).

export const DEPARTMENTS = [
  "Produce",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Bakery",
  "Frozen",
  "Pantry & Dry Goods",
  "Canned & Jarred",
  "Spices & Seasonings",
  "Beverages",
  "Other",
] as const;

export type Department = (typeof DEPARTMENTS)[number];

export const STORE_WALK_ORDER = [
  "Produce",
  "Bakery",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Canned & Jarred",
  "Pantry & Dry Goods",
  "Spices & Seasonings",
  "Beverages",
  "Frozen",
  "Other",
] as const;

export const SLOTS = ["main", "breakfast", "snack", "shake", "simple_lunch"] as const;

export const SLOT_LABELS: Record<string, string> = {
  main: "Main",
  breakfast: "Breakfast",
  snack: "Snack",
  shake: "Shake",
  simple_lunch: "Simple lunch",
};
