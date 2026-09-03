import { describe, it, expect } from "vitest";
import { computeNotifyAt, notifyLeadMinutes } from "@/lib/notify/timing";

describe("notifyLeadMinutes (Konzept §3)", () => {
  it("< 100 km -> 5 min", () => {
    expect(notifyLeadMinutes(50)).toBe(5);
    expect(notifyLeadMinutes(99.9)).toBe(5);
  });
  it("100–300 km -> 10 min", () => {
    expect(notifyLeadMinutes(100)).toBe(10);
    expect(notifyLeadMinutes(300)).toBe(10);
  });
  it("> 300 km -> 15 min", () => {
    expect(notifyLeadMinutes(300.1)).toBe(15);
    expect(notifyLeadMinutes(500)).toBe(15);
  });
});

describe("computeNotifyAt", () => {
  it("zieht den Vorlauf von der ETA ab", () => {
    const eta = new Date("2026-09-03T18:00:00Z");
    // 250 km -> 10 min vorher
    expect(computeNotifyAt(eta, 250).toISOString()).toBe("2026-09-03T17:50:00.000Z");
    // 400 km -> 15 min vorher
    expect(computeNotifyAt(eta, 400).toISOString()).toBe("2026-09-03T17:45:00.000Z");
  });
});
