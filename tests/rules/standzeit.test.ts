import { describe, it, expect } from "vitest";
import { cityStandzeit, cityFromAddress, hasCityRule } from "@/lib/rules/standzeit";

describe("cityStandzeit", () => {
  it("Düsseldorf: DC 1 Std, AC 4 Std, nachts frei — mit konkreter Uhrzeit", () => {
    const dc = cityStandzeit("Düsseldorf", "dc")!;
    expect(dc.verdict).toBe("free");
    expect(dc.label).toContain("1 Std");
    expect(dc.label).toContain("frei");
    expect(dc.label).toMatch(/21.?9/); // Uhrzeitfenster im Label
    const ac = cityStandzeit("Düsseldorf", "ac")!;
    expect(ac.label).toContain("4 Std");
    expect(ac.label).toMatch(/21.?9/);
  });

  it("Hamburg: DC 1 Std, AC 3 Std, mit Uhrzeitfenster", () => {
    expect(cityStandzeit("Hamburg", "ac")?.label).toContain("3 Std");
    expect(cityStandzeit("Hamburg", "dc")?.label).toContain("1 Std");
    expect(cityStandzeit("Hamburg", "ac")?.label).toContain("frei");
  });

  it("Köln: 4 Std tags, nachts frei (auch koeln/KÖLN)", () => {
    expect(cityStandzeit("Köln", "ac")?.label).toContain("4 Std");
    expect(cityStandzeit("Köln", "ac")?.label).toContain("frei");
    expect(cityStandzeit("koeln", "ac")?.verdict).toBe("free");
  });

  it("Aachen: DC 1 Std, AC 2 Std, 7–21 Uhr, nachts frei", () => {
    expect(cityStandzeit("Aachen", "dc")?.label).toContain("1 Std");
    expect(cityStandzeit("Aachen", "ac")?.label).toContain("2 Std");
    expect(cityStandzeit("Aachen", "ac")?.verdict).toBe("free");
    expect(hasCityRule("Aachen")).toBe(true);
  });

  it("Emmerich: Innenstadt-Parkscheibe, nachts frei", () => {
    expect(cityStandzeit("Emmerich", "ac")?.label).toContain("2 Std");
    expect(cityStandzeit("Emmerich", "ac")?.label).toContain("frei");
    expect(cityStandzeit("Emmerich am Rhein", "dc")?.verdict).toBe("free");
    expect(hasCityRule("Emmerich")).toBe(true);
  });

  it("unbekannte Stadt -> null", () => {
    expect(cityStandzeit("Kleinkleckersdorf", "ac")).toBeNull();
    expect(cityStandzeit(undefined, "ac")).toBeNull();
    expect(hasCityRule("Hamburg")).toBe(true);
  });
});

describe("cityFromAddress", () => {
  it("nutzt municipality bevorzugt", () => {
    expect(cityFromAddress("Ackerstraße 203, 40235 Düsseldorf", "Düsseldorf")).toBe("Düsseldorf");
  });
  it("parst Stadt aus Freitext (PLZ entfernt)", () => {
    expect(cityFromAddress("Grüner Weg 6, 50825 Köln")).toBe("Köln");
    expect(cityFromAddress("Große Elbstraße 63, 22767 Hamburg")).toBe("Hamburg");
  });
});
