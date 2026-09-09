import { describe, it, expect } from "vitest";
import { berlinTime, cityStandzeit, spokenStandzeit } from "@/lib/rules/standzeit";

/**
 * Der Standzeit-Sprechsatz haengt an der ANKUNFTSZEIT in deutscher Ortszeit.
 * Der Server laeuft im Container auf UTC — deshalb hier bewusst UTC-Zeitpunkte,
 * die in Berlin auf eine andere Stunde fallen.
 */

describe("berlinTime", () => {
  it("rechnet Sommerzeit um (UTC+2)", () => {
    expect(berlinTime(new Date("2026-09-09T18:30:00Z"))).toEqual({ hour: 20, day: 3 });
  });
  it("rechnet Winterzeit um (UTC+1)", () => {
    expect(berlinTime(new Date("2026-01-15T18:30:00Z"))).toEqual({ hour: 19, day: 4 });
  });
  it("erwischt den Tageswechsel", () => {
    // 22:10 UTC = 00:10 Berlin am Folgetag (Donnerstag)
    expect(berlinTime(new Date("2026-09-09T22:10:00Z"))).toEqual({ hour: 0, day: 4 });
  });
});

describe("spokenStandzeit", () => {
  const hamburgAc = cityStandzeit("Hamburg", "ac");
  const duesseldorfDc = cityStandzeit("Düsseldorf", "dc");
  const emmerich = cityStandzeit("Emmerich am Rhein", "ac");

  it("tagsüber die Höchstparkdauer, ausgeschrieben", () => {
    // Mittwoch 14 Uhr Berlin, Hamburg AC: max. 3 Std (9–20 Uhr)
    expect(spokenStandzeit(hamburgAc, new Date("2026-09-09T12:00:00Z"))).toBe(
      "Kannst dort drei Stunden stehen.",
    );
  });

  it("Einzahl bei einer Stunde", () => {
    expect(spokenStandzeit(duesseldorfDc, new Date("2026-09-09T12:00:00Z"))).toBe(
      "Kannst dort eine Stunde stehen.",
    );
  });

  it("abends nach Ende der Begrenzung: die Nacht über", () => {
    // 20:30 Berlin, Hamburgs Limit endet um 20 Uhr
    expect(spokenStandzeit(hamburgAc, new Date("2026-09-09T18:30:00Z"))).toBe(
      "Kannst dort die Nacht über stehen.",
    );
  });

  it("kurz vor Ende der Begrenzung gilt sie noch", () => {
    // 19:30 Berlin — Limit laeuft bis 20 Uhr
    expect(spokenStandzeit(hamburgAc, new Date("2026-09-09T17:30:00Z"))).toBe(
      "Kannst dort drei Stunden stehen.",
    );
  });

  it("nachts um eins ebenfalls die Nacht über", () => {
    expect(spokenStandzeit(hamburgAc, new Date("2026-09-09T23:00:00Z"))).toBe(
      "Kannst dort die Nacht über stehen.",
    );
  });

  it("Emmerich: werktags begrenzt, sonntags nicht", () => {
    // Mittwoch 14 Uhr Berlin
    expect(spokenStandzeit(emmerich, new Date("2026-09-09T12:00:00Z"))).toBe(
      "Kannst dort zwei Stunden stehen.",
    );
    // Sonntag 13 Uhr Berlin — Begrenzung gilt nur Mo–Sa, aber es ist Tag
    expect(spokenStandzeit(emmerich, new Date("2026-09-13T11:00:00Z"))).toBe(
      "Keine zeitliche Begrenzung.",
    );
  });

  it("ohne Regel wird NICHTS gesagt statt etwas erfunden", () => {
    expect(spokenStandzeit(cityStandzeit("Kleinkleckersdorf", "ac"), new Date())).toBeNull();
    expect(spokenStandzeit(null, new Date())).toBeNull();
    // Recherchierte Regel aus der DB hat nur ein Label, keine Struktur.
    expect(spokenStandzeit({ label: "Max. 2 Std", verdict: "limited" }, new Date())).toBeNull();
  });
});
