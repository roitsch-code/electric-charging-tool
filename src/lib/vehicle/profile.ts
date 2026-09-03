/**
 * Fahrzeugprofil — Audi Q4 50 e-tron quattro.
 *
 * n=1-Projekt: das eine Auto ist eine Konstante, kein DB-Eintrag. Werte aus
 * dem Datenblatt der Hersteller-App (Serienausstattung / Technische Daten).
 * KEINE FIN und keine personenbezogenen Daten hier — nur Technik.
 *
 * Warum das fuers Ranking (Konzept §8) zaehlt: Die nutzbare Ladeleistung
 * ist durch das Auto gedeckelt. Ein 300-kW-HPC bringt diesem Auto nicht
 * mehr als ein 135-kW-Lader. Der Score muss die Leistung deshalb bei der
 * Fahrzeug-Akzeptanz kappen (siehe usableDcPowerKw / usableAcPowerKw).
 */
export interface VehicleProfile {
  model: string;
  /** Brutto-Kapazitaet der HV-Batterie in kWh (nur Info, nicht nutzbar). */
  batteryGrossKwh: number;
  /** Netto nutzbare Kapazitaet in kWh — Basis aller Lade-Schaetzungen. */
  batteryNetKwh: number;
  /** Maximale AC-Ladeleistung (Onboard-Charger) in kW. */
  maxAcKw: number;
  /** Maximale DC-Ladeleistung (HPC-Peak) in kW. */
  maxDcKw: number;
  /** WLTP-Reichweite in km. */
  wltpRangeKm: number;
  /** Referenz aus dem Datenblatt: Min. Ladedauer 5–80 % bei HPC (min). */
  dcMinutes5to80: number;
  /** Referenz aus dem Datenblatt: Ladedauer 0–100 % bei max. AC (min). */
  acMinutes0to100: number;
}

export const VEHICLE: VehicleProfile = {
  model: "Audi Q4 50 e-tron quattro",
  batteryGrossKwh: 82,
  batteryNetKwh: 76.6,
  maxAcKw: 11,
  maxDcKw: 135,
  wltpRangeKm: 508,
  dcMinutes5to80: 36,
  acMinutes0to100: 450,
};

/**
 * WLTP-Effizienz aus dem Datenblatt: 23 kWh -> 150 km (10-min-Ladung),
 * bzw. 508 km / 76,6 kWh. Beide ergeben ~6,5 km/kWh. WLTP ist optimistisch.
 */
export const WLTP_KM_PER_KWH = 6.5;

/**
 * Konservative Alltags-Effizienz. GESCHAETZT/UNGEPRUEFT: ~20 kWh/100 km ist
 * fuer einen quattro-SUV bei Landstrasse/Autobahn realistischer als WLTP.
 * Fuer die Planung ehrlicher als der WLTP-Wert.
 */
export const REAL_WORLD_KM_PER_KWH = 5.0;

/**
 * Durchschnittliche DC-Leistung bis 80 % SoC, hergeleitet aus 5–80 % in
 * 36 min: 0,75 * 76,6 kWh = 57,5 kWh in 0,6 h ≈ 96 kW. Als grobe Kappung
 * fuer Lademengen-Schaetzungen im DC-Bereich (der Peak von 135 kW liegt
 * nur kurz an). GESCHAETZT — echte Ladekurve liegt nicht vor.
 */
export const DC_AVG_KW_TO_80 = 96;
