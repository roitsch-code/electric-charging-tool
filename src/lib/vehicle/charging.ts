import {
  DC_AVG_KW_TO_80,
  REAL_WORLD_KM_PER_KWH,
  VEHICLE,
  WLTP_KM_PER_KWH,
  type VehicleProfile,
} from "./profile";

export type Connector = "ac" | "dc";

/**
 * Bedarfsklasse aus Aufenthaltsdauer und Rueckfahrt (Konzept §8, Schritt 4),
 * angepasst an das reale Fahrzeug.
 *
 * WICHTIG: Das Konzept fordert "DC ≥ 150 kW". Dieses Auto akzeptiert aber
 * nur 135 kW DC. Deshalb bedeutet dc_required hier: "ein DC-Schnelllader",
 * nicht ">= 150 kW". Die konkrete Mindestleistung liefert minUsefulDcKw().
 */
export type DemandClass = "ac_ok" | "ac_or_dc" | "dc_required";

export function demandClass(
  dwellMinutes: number | null | undefined,
  returnTripKm: number | null | undefined,
): DemandClass {
  const dwell = dwellMinutes ?? 0;
  const ret = returnTripKm ?? 0;

  // Direkte, weite Rueckfahrt: DC noetig, egal wie lange man bleibt.
  if (ret > 150) return "dc_required";
  if (dwell > 0 && dwell < 60) return "dc_required";
  if (dwell > 360) return "ac_ok"; // > 6 h: AC 11 kW reicht, guenstiger
  return "ac_or_dc"; // 1–6 h (oder unbekannt): AC 22 kW oder DC
}

/** Untergrenze fuer "sinnvoll schnell" — reines DC, kein AC. */
export function minUsefulDcKw(): number {
  return 50;
}

/**
 * Nutzbare DC-Leistung: durch die Fahrzeug-Akzeptanz gedeckelt. Ein Lader
 * oberhalb von maxDcKw bringt keinen Zusatznutzen (Konzept §8, Schritt 5).
 */
export function usableDcPowerKw(
  chargerPowerKw: number,
  vehicle: VehicleProfile = VEHICLE,
): number {
  return Math.min(Math.max(chargerPowerKw, 0), vehicle.maxDcKw);
}

/** Nutzbare AC-Leistung: durch den Onboard-Charger gedeckelt. */
export function usableAcPowerKw(
  chargerPowerKw: number,
  vehicle: VehicleProfile = VEHICLE,
): number {
  return Math.min(Math.max(chargerPowerKw, 0), vehicle.maxAcKw);
}

/**
 * Grobe Schaetzung der in der Aufenthaltsdauer nachladbaren Energie (kWh).
 *
 * AC: naeherungsweise linear mit ~90 % Ladeeffizienz (Onboard-Verluste).
 * DC: bis 80 % SoC mit dem Datenblatt-Schnitt (~96 kW), aber nie mehr als
 *     die Fahrzeug-Akzeptanz und nie ueber die Netto-Kapazitaet.
 *
 * GESCHAETZT: Ohne echte Ladekurve ist das eine Naeherung, gut genug fuer
 * "reicht der Stopp?", nicht fuer eine Abrechnung. Startet konservativ ab
 * Leerstand und deckelt bei 80 % (DC) bzw. 100 % (AC).
 */
export function estimateChargeKwh(
  dwellMinutes: number,
  chargerPowerKw: number,
  connector: Connector,
  vehicle: VehicleProfile = VEHICLE,
): number {
  if (dwellMinutes <= 0 || chargerPowerKw <= 0) return 0;
  const hours = dwellMinutes / 60;

  if (connector === "ac") {
    const power = usableAcPowerKw(chargerPowerKw, vehicle);
    const gross = power * hours * 0.9;
    return round1(Math.min(gross, vehicle.batteryNetKwh));
  }

  // DC: durch Akzeptanz UND durch den realistischen Schnitt bis 80 % gedeckelt.
  const power = Math.min(
    usableDcPowerKw(chargerPowerKw, vehicle),
    DC_AVG_KW_TO_80,
  );
  const gross = power * hours;
  const dcCap = vehicle.batteryNetKwh * 0.8; // Schnellladen sinnvoll bis ~80 %
  return round1(Math.min(gross, dcCap));
}

/** Nachgeladene Reichweite (km) aus kWh. WLTP oder konservativ real. */
export function estimateAddedRangeKm(
  kwh: number,
  basis: "wltp" | "real" = "real",
): number {
  const factor = basis === "wltp" ? WLTP_KM_PER_KWH : REAL_WORLD_KM_PER_KWH;
  return Math.round(kwh * factor);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
