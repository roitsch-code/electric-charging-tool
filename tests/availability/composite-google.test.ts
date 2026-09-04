import { describe, it, expect } from "vitest";
import { aggregateGoogleStatus, mergeSnapshots } from "@/lib/availability";
import type { AvailabilitySnapshot } from "@/lib/availability";

describe("aggregateGoogleStatus", () => {
  it("availableCount>0 -> available, mit total und Zeitstempel", () => {
    const place = {
      evChargeOptions: {
        connectorAggregation: [
          { count: 10, availableCount: 4, outOfServiceCount: 1, availabilityLastUpdateTime: "2026-09-04T20:00:00Z" },
        ],
      },
    };
    const a = aggregateGoogleStatus(place);
    expect(a.status).toBe("available");
    expect(a.available).toBe(4);
    expect(a.total).toBe(10);
    expect(a.lastUpdate).toBe("2026-09-04T20:00:00Z");
  });

  it("alle außer Betrieb -> outoforder", () => {
    const place = { evChargeOptions: { connectorAggregation: [{ count: 2, availableCount: 0, outOfServiceCount: 2, availabilityLastUpdateTime: "t" }] } };
    expect(aggregateGoogleStatus(place).status).toBe("outoforder");
  });

  it("keine Echtzeitfelder -> unknown", () => {
    const place = { evChargeOptions: { connectorAggregation: [{ count: 4 }] } };
    expect(aggregateGoogleStatus(place).status).toBe("unknown");
  });
});

describe("mergeSnapshots (Composite-Fallback)", () => {
  const at = (lat: number, lng: number, status: AvailabilitySnapshot["status"], fetchedAt: string): AvailabilitySnapshot =>
    ({ lat, lng, status, available: status === "available" ? 1 : 0, total: 2, fetchedAt });

  it("bekannter Status verdraengt unknown am selben Ort", () => {
    const merged = mergeSnapshots([
      at(53.5443, 9.949, "unknown", "2026-09-04T20:00:00Z"), // TomTom: unbekannt
      at(53.54431, 9.94901, "available", "2026-09-04T20:01:00Z"), // Google: frei, ~1 m
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.status).toBe("available");
  });

  it("zwei bekannte am selben Ort -> der frischere gewinnt", () => {
    const merged = mergeSnapshots([
      at(53.5443, 9.949, "occupied", "2026-09-04T20:00:00Z"),
      at(53.54431, 9.94901, "available", "2026-09-04T20:05:00Z"),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.status).toBe("available");
  });

  it("weit entfernte Orte bleiben getrennt", () => {
    const merged = mergeSnapshots([
      at(53.5443, 9.949, "available", "t"),
      at(53.5600, 9.949, "occupied", "t"),
    ]);
    expect(merged).toHaveLength(2);
  });
});
