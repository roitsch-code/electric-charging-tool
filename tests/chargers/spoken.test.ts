import { describe, it, expect } from "vitest";
import { planDestination } from "@/lib/chargers/plan";
import { spokenForPlan } from "@/lib/chargers/spoken";
import type { PlanResult } from "@/lib/chargers/types";

const GASTWERK = { lat: 53.551, lng: 9.9215, name: "Gastwerk Hotel Hamburg" };
const RURAL = { lat: 53.2, lng: 7.5, name: "Landgasthof" };

describe("spokenForPlan (Konzept §6.6)", () => {
  it("nennt Einheit ausgeschrieben und ohne Abkuerzung", async () => {
    const plan = await planDestination(GASTWERK, { dwellMinutes: 480, returnTripKm: null });
    const text = spokenForPlan(plan, { dwellMinutes: 480, returnTripKm: null }, 0)!;
    expect(text).toContain("Kilowatt");
    expect(text).not.toMatch(/\bkW\b/);
    expect(text).toContain("Ladeplanner:");
  });

  it("sagt 'direkt am' fuer einen Ladepunkt am Ziel und bewertet 'ueber Nacht'", async () => {
    const plan = await planDestination(GASTWERK, { dwellMinutes: 480, returnTripKm: null });
    const text = spokenForPlan(plan, { dwellMinutes: 480, returnTripKm: null }, 0)!;
    expect(text).toContain("direkt am Gastwerk Hotel Hamburg");
    expect(text).toContain("Reicht über Nacht");
  });

  it("weist auf die Radius-Erweiterung hin", async () => {
    const plan = await planDestination(RURAL, { dwellMinutes: 180, returnTripKm: null });
    const text = spokenForPlan(plan, { dwellMinutes: 180, returnTripKm: null }, 0)!;
    expect(text).toContain("erweiterten Umkreis");
  });

  it("sagt 'Belegung unbekannt', wenn keine Realtime-Daten vorliegen", () => {
    const result: PlanResult = {
      destination: { lat: 0, lng: 0, name: "Testort, Stadt" },
      demandClass: "ac_or_dc",
      usedRadiusM: 500,
      expanded: false,
      candidateCount: 1,
      dataTimestamp: null,
      top: [
        {
          charger: {
            evseId: "x",
            name: "Test",
            lat: 0,
            lng: 0,
            powerKw: 300,
            connector: "dc",
          },
          rank: 1,
          airlineM: 100,
          walkingM: 130,
          usablePowerKw: 135,
          distanceScore: 0.4,
          classScore: 0.8,
          availabilityScore: 0.5,
          score: 0.6,
        },
      ],
    };
    const text = spokenForPlan(result, { dwellMinutes: 180, returnTripKm: null }, 0)!;
    expect(text).toContain("Belegung unbekannt");
    expect(text).toContain("135 Kilowatt");
    expect(text).toContain("130 Meter vom Testort"); // Name bis zum Komma gekuerzt
  });

  it("meldet ehrlich, wenn nichts gefunden wurde", async () => {
    const plan = await planDestination({ lat: 0, lng: 0 }, { dwellMinutes: 120, returnTripKm: null });
    const text = spokenForPlan(plan, { dwellMinutes: 120, returnTripKm: null }, 0)!;
    expect(text).toContain("kein Ladepunkt");
  });
});
