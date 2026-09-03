import { describe, it, expect } from "vitest";
import { planDestination } from "@/lib/chargers/plan";

const GASTWERK = { lat: 53.551, lng: 9.9215, name: "Gastwerk Hotel Hamburg" };
const RURAL = { lat: 53.2, lng: 7.5, name: "Landgasthof" };

describe("planDestination (Seed-Quelle)", () => {
  it("ueber Nacht am Gastwerk: ac_ok, Ladepunkt am Ziel auf Rang 1", async () => {
    const plan = await planDestination(GASTWERK, {
      dwellMinutes: 480,
      returnTripKm: null,
    });
    expect(plan.demandClass).toBe("ac_ok");
    expect(plan.expanded).toBe(false);
    expect(plan.candidateCount).toBeGreaterThanOrEqual(5);
    expect(plan.top).toHaveLength(3);
    expect(plan.top[0]!.charger.atDestination).toBe(true);
    expect(plan.dataTimestamp).not.toBeNull();
  });

  it("kurzer Halt + weite Rueckfahrt: dc_required, DC-Lader vorne", async () => {
    const plan = await planDestination(GASTWERK, {
      dwellMinutes: 30,
      returnTripKm: 300,
    });
    expect(plan.demandClass).toBe("dc_required");
    // Der 11-kW-AC-Punkt am Ziel ist hier UNpassend und darf nicht Rang 1
    // sein — ein Schnelllader muss vorne liegen (Verfeinerung §8, Schritt 3).
    expect(plan.top[0]!.charger.connector).toBe("dc");
    expect(plan.top[0]!.charger.atDestination).toBeFalsy();
  });

  it("laendliches Ziel: Radius wird auf 2000 m erweitert", async () => {
    const plan = await planDestination(RURAL, {
      dwellMinutes: 180,
      returnTripKm: null,
    });
    expect(plan.expanded).toBe(true);
    expect(plan.usedRadiusM).toBe(2000);
    expect(plan.candidateCount).toBe(1);
    expect(plan.top).toHaveLength(1);
  });

  it("Ziel im Nirgendwo: keine Kandidaten, leere Top-Liste", async () => {
    const plan = await planDestination(
      { lat: 0, lng: 0 },
      { dwellMinutes: 120, returnTripKm: null },
    );
    expect(plan.candidateCount).toBe(0);
    expect(plan.top).toHaveLength(0);
    expect(plan.dataTimestamp).toBeNull();
  });
});
