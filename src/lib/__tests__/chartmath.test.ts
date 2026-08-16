import { describe, expect, it } from "vitest";
import { deltaBarPct, niceTicks, weightDomain } from "../chartmath";

describe("weightDomain", () => {
  it("zooms to the readings when the goal is far away", () => {
    // 250–254 readings, 175 goal: the old chart flattened this to a line.
    const d = weightDomain([250.2, 252.8, 254.4], 175);
    expect(d.goalInline).toBe(false);
    expect(d.lo).toBe(248.2);
    expect(d.hi).toBe(256.4);
  });

  it("pulls the goal inline once within range", () => {
    const d = weightDomain([182, 184.5], 175); // 7 lb below the low reading
    expect(d.goalInline).toBe(true);
    expect(d.lo).toBe(173); // goal − margin
  });

  it("handles a goal above the readings (gain)", () => {
    const d = weightDomain([150, 152], 160);
    expect(d.goalInline).toBe(true);
    expect(d.hi).toBe(162);
  });

  it("works with a single reading and no goal", () => {
    const d = weightDomain([200], null);
    expect(d).toEqual({ lo: 198, hi: 202, goalInline: false });
  });
});

describe("niceTicks", () => {
  it("emits round numbers inside the domain", () => {
    expect(niceTicks(248.2, 256.4)).toEqual([250, 252, 254, 256]);
  });

  it("respects the tick budget on wide domains", () => {
    const ticks = niceTicks(173, 186.5);
    expect(ticks.length).toBeLessThanOrEqual(4);
    expect(ticks).toEqual([175, 180, 185]);
  });

  it("degrades sanely on a zero-width domain", () => {
    expect(niceTicks(200, 200)).toEqual([200]);
  });
});

describe("deltaBarPct", () => {
  it("scales a pound of delta to a full half-track", () => {
    expect(deltaBarPct(3500)).toBe(100);
    expect(deltaBarPct(-1750)).toBe(50); // direction handled by the caller
    expect(deltaBarPct(700)).toBe(20);
  });

  it("clamps beyond a pound", () => {
    expect(deltaBarPct(9000)).toBe(100);
  });

  it("passes null through", () => {
    expect(deltaBarPct(null)).toBeNull();
  });
});
