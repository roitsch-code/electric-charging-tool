import { describe, it, expect } from "vitest";
import { cityStandzeit, cityFromAddress, hasCityRule } from "@/lib/rules/standzeit";

describe("cityStandzeit", () => {
  it("Düsseldorf: DC 1 Std, AC 4 Std, nachts frei", () => {
    expect(cityStandzeit("Düsseldorf", "dc")).toEqual({ label: "Nachts frei · tagsüber max. 1 Std", verdict: "free" });
    expect(cityStandzeit("Düsseldorf", "ac")?.label).toContain("4 Std");
  });

  it("Hamburg: DC 1 Std, AC 3 Std, nachts ohne Limit", () => {
    expect(cityStandzeit("Hamburg", "ac")?.label).toContain("3 Std");
    expect(cityStandzeit("Hamburg", "dc")?.label).toContain("1 Std");
  });

  it("Köln: 4 Std tags, nachts frei (auch koeln/KÖLN)", () => {
    expect(cityStandzeit("Köln", "ac")?.label).toContain("4 Std");
    expect(cityStandzeit("koeln", "ac")?.verdict).toBe("free");
  });

  it("unbekannte Stadt -> null", () => {
    expect(cityStandzeit("Kleinkleckersdorf", "ac")).toBeNull();
    expect(cityStandzeit(undefined, "ac")).toBeNull();
    expect(hasCityRule("Emmerich")).toBe(false);
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
