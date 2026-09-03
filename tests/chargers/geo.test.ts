import { describe, it, expect } from "vitest";
import { estimateWalkingMeters, haversineMeters } from "@/lib/chargers/geo";

describe("haversineMeters", () => {
  it("misst ~156 m fuer 0,0014 Grad Breite", () => {
    const d = haversineMeters(
      { lat: 53.5511, lng: 9.9215 },
      { lat: 53.5525, lng: 9.9215 },
    );
    expect(d).toBeGreaterThan(150);
    expect(d).toBeLessThan(165);
  });

  it("ist 0 fuer denselben Punkt", () => {
    expect(haversineMeters({ lat: 53, lng: 9 }, { lat: 53, lng: 9 })).toBe(0);
  });
});

describe("estimateWalkingMeters", () => {
  it("wendet den Umwegfaktor 1,3 an", () => {
    expect(estimateWalkingMeters(100)).toBe(130);
  });
});
