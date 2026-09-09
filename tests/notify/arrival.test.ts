import { describe, it, expect } from "vitest";
import { spokenArrival } from "@/lib/chargers/spoken";
import type { Charger } from "@/lib/chargers/types";

/**
 * Der Ankunfts-Push (15 min vor Ankunft, auch wenn alles in Ordnung ist).
 * Er wird im Auto vorgelesen — also kurz, ohne Abkuerzungen, und er behauptet
 * nichts, was nicht in den Daten steht.
 */

function charger(over: Partial<Charger> = {}): Charger {
  return {
    evseId: "TT:1",
    name: "Nollenburger Weg 34, 46446 Emmerich am Rhein",
    lat: 51.83,
    lng: 6.25,
    powerKw: 22,
    connector: "ac",
    source: "tomtom",
    status: "available",
    freePoints: 4,
    totalPoints: 4,
    city: "Emmerich",
    ...over,
  } as Charger;
}

describe("spokenArrival", () => {
  it("nennt Name, Belegung und Leistung — in dieser Reihenfolge", () => {
    const s = spokenArrival(charger(), "egal", new Date("2026-09-09T20:10:00Z"));
    expect(s).toContain("Nollenburger Weg 34 ist frei");
    expect(s).toContain("vier von vier Punkten");
    // Fahrzeug-Deckelung: AC bei 11 kW, nicht die 22 kW vom Typenschild.
    expect(s).toContain("11 Kilowatt");
    expect(s).not.toContain("kW");
  });

  it("laesst den Zaehler weg, wenn es nur einen Punkt gibt", () => {
    const s = spokenArrival(charger({ freePoints: 1, totalPoints: 1 }), "egal");
    expect(s).toContain("ist frei");
    expect(s).not.toContain("von einem Punkt");
  });

  it("ohne Live-Daten wird nichts behauptet, aber auch nicht geschwiegen", () => {
    const s = spokenArrival(null, "Nollenburger Weg 34, 46446 Emmerich");
    expect(s).toContain("Nollenburger Weg 34");
    expect(s).toContain("keine Live-Daten");
    expect(s).toContain("vor Ort prüfen");
    expect(s).not.toContain("frei");
  });

  it("unbekannter Status zaehlt wie keine Daten", () => {
    const s = spokenArrival(charger({ status: "unknown", freePoints: undefined }), "egal");
    expect(s).toContain("keine Live-Daten");
  });

  it("haengt die Standzeit an, wenn eine kuratierte Regel greift", () => {
    // 22:10 Ortszeit in Emmerich: nachts frei -> "die Nacht über".
    const s = spokenArrival(charger(), "egal", new Date("2026-09-09T20:10:00Z"));
    expect(s).toMatch(/stehen\.$/);
  });

  it("bleibt kurz genug zum Vorlesen (hoechstens 25 Woerter)", () => {
    const s = spokenArrival(charger(), "egal", new Date("2026-09-09T20:10:00Z"));
    expect(s.split(/\s+/).length).toBeLessThanOrEqual(25);
  });
});
