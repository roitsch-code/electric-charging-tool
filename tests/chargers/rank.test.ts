import { describe, it, expect } from "vitest";
import { classScore, rankChargers, usablePowerOf } from "@/lib/chargers/rank";
import type { Charger } from "@/lib/chargers/types";

const DEST = { lat: 53.551, lng: 9.9215 };

function charger(partial: Partial<Charger> & Pick<Charger, "evseId">): Charger {
  return {
    name: partial.name ?? partial.evseId,
    lat: partial.lat ?? 53.5525,
    lng: partial.lng ?? 9.9215,
    powerKw: partial.powerKw ?? 11,
    connector: partial.connector ?? "ac",
    ...partial,
  };
}

describe("rankChargers — atDestination (Konzept §8, Schritt 3, verfeinert)", () => {
  it("setzt einen passenden Ladepunkt am Ziel auf Rang 1, trotz schwacher Leistung", () => {
    // Ueber Nacht: AC am Ziel ist ideal und gewinnt gegen staerkeres DC.
    const list = [
      charger({ evseId: "dc-strong", connector: "dc", powerKw: 150, status: "available" }),
      charger({
        evseId: "ac-weak-at-dest",
        connector: "ac",
        powerKw: 11,
        atDestination: true,
        lat: 53.5511,
        status: "available",
      }),
    ];
    const ranked = rankChargers(list, DEST, "ac_ok");
    expect(ranked[0]!.charger.evseId).toBe("ac-weak-at-dest");
    expect(ranked[0]!.rank).toBe(1);
  });

  it("verweigert den Ziel-Bonus, wenn der Punkt zur Bedarfsklasse UNpassend ist", () => {
    // Kurzhalt/dc_required: 11-kW-AC am Ziel darf NICHT Rang 1 sein — der
    // Schnelllader gewinnt (Verfeinerung von §8, Schritt 3).
    const list = [
      charger({ evseId: "dc-strong", connector: "dc", powerKw: 150, status: "available" }),
      charger({
        evseId: "ac-weak-at-dest",
        connector: "ac",
        powerKw: 11,
        atDestination: true,
        lat: 53.5511,
        status: "available",
      }),
    ];
    const ranked = rankChargers(list, DEST, "dc_required");
    expect(ranked[0]!.charger.evseId).toBe("dc-strong");
  });
});

describe("rankChargers — Bedarfsklasse", () => {
  it("ac_ok (ueber Nacht): AC 11 kW schlaegt DC 150 kW bei gleicher Distanz", () => {
    const list = [
      charger({ evseId: "dc", connector: "dc", powerKw: 150, status: "available" }),
      charger({ evseId: "ac", connector: "ac", powerKw: 11, status: "available" }),
    ];
    const ranked = rankChargers(list, DEST, "ac_ok");
    expect(ranked[0]!.charger.evseId).toBe("ac");
  });

  it("dc_required: DC schlaegt AC bei gleicher Distanz und Verfuegbarkeit", () => {
    const list = [
      charger({ evseId: "ac", connector: "ac", powerKw: 22, status: "available" }),
      charger({ evseId: "dc", connector: "dc", powerKw: 150, status: "available" }),
    ];
    const ranked = rankChargers(list, DEST, "dc_required");
    expect(ranked[0]!.charger.evseId).toBe("dc");
  });
});

describe("classScore — Fahrzeug-Akzeptanz deckelt die Leistung", () => {
  it("150-kW- und 300-kW-DC bekommen denselben Klassen-Score", () => {
    const dc150 = charger({ evseId: "a", connector: "dc", powerKw: 150 });
    const dc300 = charger({ evseId: "b", connector: "dc", powerKw: 300 });
    expect(classScore(dc150, "dc_required")).toBe(classScore(dc300, "dc_required"));
  });

  it("nutzbare Leistung wird bei 135 kW gekappt", () => {
    expect(usablePowerOf(charger({ evseId: "x", connector: "dc", powerKw: 300 }))).toBe(135);
  });

  it("AC ist fuer dc_required praktisch unbrauchbar", () => {
    const ac = charger({ evseId: "ac", connector: "ac", powerKw: 22 });
    expect(classScore(ac, "dc_required")).toBeLessThan(0.1);
  });
});

describe("rankChargers — Verfuegbarkeit als Tiebreaker", () => {
  it("bei sonst gleichen Punkten gewinnt der freie vor dem belegten", () => {
    const list = [
      charger({ evseId: "busy", connector: "dc", powerKw: 150, status: "occupied" }),
      charger({ evseId: "free", connector: "dc", powerKw: 150, status: "available" }),
    ];
    const ranked = rankChargers(list, DEST, "dc_required");
    expect(ranked[0]!.charger.evseId).toBe("free");
  });
});
