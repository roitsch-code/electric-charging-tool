import { describe, it, expect } from "vitest";
import { extractCoordinates } from "@/lib/resolver/extractCoordinates";
import { resolvedUrlCases } from "./fixtures";

describe("extractCoordinates (Stufe 1, Parsing)", () => {
  for (const c of resolvedUrlCases) {
    it(`${c.id}: ${c.note}`, () => {
      const result = extractCoordinates(c.url);
      if (c.expectCoords) {
        expect(result).not.toBeNull();
        expect(result!.lat).toBeCloseTo(c.expectCoords.lat, 6);
        expect(result!.lng).toBeCloseTo(c.expectCoords.lng, 6);
      } else {
        expect(result).toBeNull();
      }
    });
  }

  it("bevorzugt den data-Pin (!3d!4d) vor dem Viewport (/@)", () => {
    const url =
      "https://www.google.com/maps/place/X/@10.0,20.0,17z/data=!8m2!3d11.0!4d21.0";
    expect(extractCoordinates(url)).toEqual({ lat: 11.0, lng: 21.0 });
  });

  it("verwirft (0,0) als Parser-Artefakt", () => {
    expect(extractCoordinates("https://www.google.com/maps?q=0,0")).toBeNull();
  });

  it("verwirft ausserhalb gueltiger Wertebereiche", () => {
    expect(
      extractCoordinates("https://www.google.com/maps?q=200.0,999.0"),
    ).toBeNull();
  });

  it("liefert null bei muellhaltiger Eingabe", () => {
    expect(extractCoordinates("nicht mal eine url")).toBeNull();
    expect(extractCoordinates("")).toBeNull();
  });
});
