import { describe, it, expect } from "vitest";
import {
  demandClass,
  estimateAddedRangeKm,
  estimateChargeKwh,
  usableAcPowerKw,
  usableDcPowerKw,
} from "@/lib/vehicle/charging";
import { VEHICLE } from "@/lib/vehicle/profile";

describe("Fahrzeugprofil (Audi Q4 50 e-tron quattro)", () => {
  it("haelt die Datenblatt-Eckwerte", () => {
    expect(VEHICLE.batteryNetKwh).toBe(76.6);
    expect(VEHICLE.maxAcKw).toBe(11);
    expect(VEHICLE.maxDcKw).toBe(135);
  });
});

describe("usable power (Fahrzeug-Akzeptanz deckelt den Lader)", () => {
  it("deckelt DC bei 135 kW — 300 kW bringen nicht mehr", () => {
    expect(usableDcPowerKw(300)).toBe(135);
    expect(usableDcPowerKw(150)).toBe(135);
    expect(usableDcPowerKw(50)).toBe(50);
  });

  it("ein 300-kW- und ein 150-kW-Lader sind fuer dieses Auto gleichwertig", () => {
    expect(usableDcPowerKw(300)).toBe(usableDcPowerKw(150));
  });

  it("deckelt AC bei 11 kW — 22 kW bringen nicht mehr", () => {
    expect(usableAcPowerKw(22)).toBe(11);
    expect(usableAcPowerKw(11)).toBe(11);
    expect(usableAcPowerKw(3.7)).toBe(3.7);
  });

  it("behandelt negative/nonsens-Leistung als 0", () => {
    expect(usableDcPowerKw(-5)).toBe(0);
    expect(usableAcPowerKw(-1)).toBe(0);
  });
});

describe("demandClass (Konzept §8, Schritt 4)", () => {
  it("> 6 h -> AC reicht", () => {
    expect(demandClass(480, 0)).toBe("ac_ok"); // ueber Nacht
  });
  it("1–6 h -> AC oder DC", () => {
    expect(demandClass(180, 0)).toBe("ac_or_dc");
  });
  it("< 1 h -> DC noetig", () => {
    expect(demandClass(30, 0)).toBe("dc_required");
  });
  it("weite direkte Rueckfahrt -> DC noetig, trotz langem Aufenthalt", () => {
    expect(demandClass(600, 200)).toBe("dc_required");
  });
  it("unbekannte Dauer -> vorsichtig ac_or_dc", () => {
    expect(demandClass(null, null)).toBe("ac_or_dc");
  });
});

describe("estimateChargeKwh (grobe Naeherung)", () => {
  it("AC ueber Nacht (8 h, 11 kW) fuellt praktisch voll", () => {
    const kwh = estimateChargeKwh(480, 11, "ac");
    // 11 * 8 * 0.9 = 79.2, gedeckelt auf Netto 76.6
    expect(kwh).toBe(76.6);
  });

  it("AC 2 h bei 11 kW ~ 19.8 kWh", () => {
    expect(estimateChargeKwh(120, 11, "ac")).toBeCloseTo(19.8, 1);
  });

  it("DC 30 min am 150-kW-Lader nutzt hoechstens den ~96-kW-Schnitt", () => {
    // min(135, 96) = 96; 96 * 0.5 h = 48 kWh, unter 80%-Cap (61.3)
    expect(estimateChargeKwh(30, 150, "dc")).toBeCloseTo(48, 0);
  });

  it("DC deckelt bei ~80 % SoC", () => {
    const kwh = estimateChargeKwh(240, 150, "dc");
    expect(kwh).toBeCloseTo(76.6 * 0.8, 1);
  });

  it("kein Ladepunkt / keine Zeit -> 0", () => {
    expect(estimateChargeKwh(0, 150, "dc")).toBe(0);
    expect(estimateChargeKwh(60, 0, "ac")).toBe(0);
  });
});

describe("estimateAddedRangeKm", () => {
  it("real-Basis ist konservativer als WLTP", () => {
    expect(estimateAddedRangeKm(20, "real")).toBeLessThan(
      estimateAddedRangeKm(20, "wltp"),
    );
  });
  it("WLTP ~6.5 km/kWh", () => {
    expect(estimateAddedRangeKm(23, "wltp")).toBe(150); // Datenblatt-Punkt
  });
});
