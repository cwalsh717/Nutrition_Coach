import { describe, expect, it } from "vitest";
import {
  asPlainText, formatItem, groupByDepartment, mergeRows, reviewSort,
  type CandidateRow,
} from "../shopping";

const row = (over: Partial<CandidateRow>): CandidateRow => ({
  name: "x", qty: 1, unit: "", department: "Other", source: "A", likelyHave: false, ...over,
});

describe("mergeRows", () => {
  it("sums quantities when name and unit match", () => {
    const merged = mergeRows([
      row({ name: "chicken thighs", qty: 900, unit: "g", source: "A" }),
      row({ name: "Chicken Thighs", qty: 500, unit: "g", source: "B" }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].qty).toBe(1400);
    expect(merged[0].sources).toEqual(["A", "B"]);
  });

  it("never merges different units (no conversion guessing)", () => {
    const merged = mergeRows([
      row({ name: "chicken", qty: 900, unit: "g" }),
      row({ name: "chicken", qty: 2, unit: "lb" }),
    ]);
    expect(merged).toHaveLength(2);
  });

  it("keeps qty-less lines separate from numeric ones", () => {
    const merged = mergeRows([
      row({ name: "salt", qty: null }),
      row({ name: "salt", qty: 2, unit: "" }),
    ]);
    expect(merged).toHaveLength(2);
  });

  it("is likelyHave only when every contributor is", () => {
    const merged = mergeRows([
      row({ name: "oil", qty: 1, likelyHave: true, source: "A" }),
      row({ name: "oil", qty: 1, likelyHave: false, source: "B" }),
    ]);
    expect(merged[0].likelyHave).toBe(false);
  });
});

describe("reviewSort", () => {
  it("puts likely-need before likely-have (steak before salt)", () => {
    const items = mergeRows([
      row({ name: "kosher salt", qty: null, department: "Spices & Seasonings", likelyHave: true }),
      row({ name: "steak", qty: 2, unit: "lb", department: "Meat & Seafood" }),
    ]).sort(reviewSort);
    expect(items[0].name).toBe("steak");
    expect(items[1].name).toBe("kosher salt");
  });
});

describe("formatItem", () => {
  it("drops trailing .0 and handles missing qty/unit", () => {
    expect(formatItem({ qty: 2, unit: "cup", name: "rice" })).toBe("2 cup rice");
    expect(formatItem({ qty: 1.5, unit: "lb", name: "beef" })).toBe("1.5 lb beef");
    expect(formatItem({ qty: null, unit: "", name: "cilantro" })).toBe("cilantro");
    expect(formatItem({ qty: 7, unit: "", name: "shakes" })).toBe("7 shakes");
  });
});

describe("groupByDepartment + asPlainText", () => {
  it("walks the store in order and appends the kcal total", () => {
    const groups = groupByDepartment([
      { name: "frozen peas", qty: 1, unit: "bag", department: "Frozen" },
      { name: "broccoli", qty: 2, unit: "head", department: "Produce" },
    ]);
    expect(groups.map((g) => g.department)).toEqual(["Produce", "Frozen"]);
    const text = asPlainText(groups, 15200);
    expect(text).toContain("== Produce ==");
    expect(text.indexOf("Produce")).toBeLessThan(text.indexOf("Frozen"));
    expect(text).toContain("Estimated week total: 15,200 kcal");
  });

  it("omits the total line when no target math exists", () => {
    expect(asPlainText([], null)).not.toContain("Estimated");
  });
});
