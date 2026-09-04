import { describe, it, expect } from "vitest";
import {
  aggregateTomTomStatus,
  nearestSnapshot,
  type AvailabilityProvider,
} from "@/lib/availability";
import { SeedChargerSource, planDestination } from "@/lib/chargers";
import type { Charger } from "@/lib/chargers/types";

describe("aggregateTomTomStatus", () => {
  it("liest das Doku-Beispiel: 1 frei / 1 belegt -> available, 1 von 2", () => {
    const res = {
      connectors: [
        {
          type: "IEC62196Type2Outlet",
          total: 2,
          availability: { current: { available: 1, occupied: 1 } },
        },
      ],
    };
    expect(aggregateTomTomStatus(res)).toEqual({ status: "available", available: 1, total: 2 });
  });

  it("alle belegt -> occupied", () => {
    const res = { connectors: [{ availability: { current: { occupied: 2 } } }] };
    expect(aggregateTomTomStatus(res).status).toBe("occupied");
  });

  it("nur outOfService -> outoforder", () => {
    const res = { connectors: [{ availability: { current: { outOfService: 1 } } }] };
    expect(aggregateTomTomStatus(res).status).toBe("outoforder");
  });

  it("leer -> unknown", () => {
    expect(aggregateTomTomStatus({}).status).toBe("unknown");
  });
});

describe("nearestSnapshot", () => {
  const snaps = [
    { lat: 53.5445, lng: 9.949, status: "available" as const, available: 2, total: 3, fetchedAt: "t" },
    { lat: 53.547, lng: 9.949, status: "occupied" as const, available: 0, total: 2, fetchedAt: "t" },
  ];
  it("findet den nahen Snapshot innerhalb der Schwelle", () => {
    const s = nearestSnapshot({ lat: 53.5443, lng: 9.949 }, snaps);
    expect(s?.status).toBe("available");
  });
  it("liefert null, wenn nichts innerhalb der Schwelle liegt", () => {
    const s = nearestSnapshot({ lat: 53.6, lng: 9.949 }, snaps);
    expect(s).toBeNull();
  });
});

describe("planDestination mit Live-Belegung", () => {
  const dest = { lat: 53.5443, lng: 9.949, name: "Testziel" };
  const near: Charger = {
    evseId: "A", name: "Near", lat: 53.5445, lng: 9.949, powerKw: 22, connector: "ac", status: "unknown",
  };
  const far: Charger = {
    evseId: "B", name: "Far", lat: 53.547, lng: 9.949, powerKw: 22, connector: "ac", status: "unknown",
  };

  const provider: AvailabilityProvider = {
    near: async () => [
      { lat: 53.5445, lng: 9.949, name: "Near", status: "available", available: 2, total: 3, fetchedAt: "2026-09-04T20:00:00.000Z" },
    ],
  };

  it("reichert den passenden Ladepunkt an, ohne die Quelle zu mutieren", async () => {
    const source = new SeedChargerSource([near, far]);
    const plan = await planDestination(
      dest,
      { dwellMinutes: 480, returnTripKm: null },
      source,
      provider,
    );
    const a = plan.top.find((r) => r.charger.evseId === "A")!;
    expect(a.charger.status).toBe("available");
    expect(a.charger.statusUpdatedAt).toBe("2026-09-04T20:00:00.000Z");
    // Der geteilte Quell-Charger bleibt unveraendert (Klon in applySnapshot).
    expect(near.status).toBe("unknown");
    expect(plan.dataTimestamp).toBe("2026-09-04T20:00:00.000Z");
  });

  it("ohne Provider bleibt der Status unbekannt", async () => {
    const source = new SeedChargerSource([near, far]);
    const plan = await planDestination(dest, { dwellMinutes: 480, returnTripKm: null }, source);
    expect(plan.top.every((r) => r.charger.status === "unknown")).toBe(true);
  });
});
