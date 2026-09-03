import { describe, it, expect } from "vitest";
import { extractPlaceName } from "@/lib/resolver/extractPlaceName";
import { resolvedUrlCases } from "./fixtures";

describe("extractPlaceName (fuer Stufe 2)", () => {
  for (const c of resolvedUrlCases) {
    it(`${c.id}: ${c.note}`, () => {
      expect(extractPlaceName(c.url)).toBe(c.expectName);
    });
  }

  it("dekodiert Plus-Trennung und Prozent-Sequenzen", () => {
    const url =
      "https://www.google.com/maps/place/Caf%C3%A9+am+Markt+K%C3%B6ln/@50.9,6.9,17z";
    expect(extractPlaceName(url)).toBe("Café am Markt Köln");
  });

  it("gibt keinen Namen zurueck, wenn das Segment Koordinaten sind", () => {
    const url = "https://www.google.com/maps/place/50.9,6.9/@50.9,6.9,17z";
    expect(extractPlaceName(url)).toBeNull();
  });

  it("faellt bei kaputter Prozent-Sequenz nicht um", () => {
    const url = "https://www.google.com/maps/place/Broken%ZZName";
    expect(() => extractPlaceName(url)).not.toThrow();
  });
});
