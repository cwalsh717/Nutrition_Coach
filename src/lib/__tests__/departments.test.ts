import { describe, expect, it } from "vitest";
import { parseDepartmentReply } from "../departments";

// Canned replies only — the real call lives in a server-only module and is
// never reached from here.
describe("parseDepartmentReply", () => {
  it("takes a department the store walk knows", () => {
    expect(parseDepartmentReply({ department: "Beverages" })).toBe("Beverages");
    expect(parseDepartmentReply({ department: "Meat & Seafood" })).toBe("Meat & Seafood");
  });

  it("degrades an off-list department to Other rather than rejecting the reply", () => {
    // groupByDepartment iterates STORE_WALK_ORDER and silently drops anything
    // outside it, so an invented department would make the item vanish.
    expect(parseDepartmentReply({ department: "Aisle 7" })).toBe("Other");
  });

  it("ignores extra keys the model volunteers", () => {
    expect(
      parseDepartmentReply({ department: "Produce", confidence: 0.9, note: "fresh" }),
    ).toBe("Produce");
  });

  it("returns null when there is no usable department field", () => {
    expect(parseDepartmentReply({})).toBeNull();
    expect(parseDepartmentReply({ dept: "Produce" })).toBeNull();
    expect(parseDepartmentReply({ department: "" })).toBeNull();
    expect(parseDepartmentReply({ department: 3 })).toBeNull();
    expect(parseDepartmentReply(null)).toBeNull();
    expect(parseDepartmentReply("Produce")).toBeNull();
    expect(parseDepartmentReply([])).toBeNull();
  });

  it("keeps null distinct from a genuine Other", () => {
    expect(parseDepartmentReply({ department: "Other" })).toBe("Other");
    expect(parseDepartmentReply({})).toBeNull();
  });
});
