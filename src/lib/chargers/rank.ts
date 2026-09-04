import type { Coordinates } from "@/lib/resolver/types";
import {
  VEHICLE,
  minUsefulDcKw,
  usableAcPowerKw,
  usableDcPowerKw,
  type DemandClass,
} from "@/lib/vehicle";
import { estimateWalkingMeters, haversineMeters } from "./geo";
import type { Charger, RankedCharger } from "./types";

/**
 * Score-Gewichte (Konzept §8, Schritt 5): w1·Naehe + w2·Klassen-Match +
 * w3·Verfuegbarkeit. Bewusst als Konstanten, im Alltag nachzuschaerfen.
 */
export const WEIGHTS = { distance: 0.4, class: 0.4, availability: 0.2 };

/**
 * Verfeinerung gegenueber Konzept §8, Schritt 3 ("Ladepunkt AM Ziel immer
 * Rang 1, unabhaengig von der Leistung"): Der Ziel-Bonus greift NUR, wenn
 * der Punkt zur Bedarfsklasse passt. Sonst entstuende der Widerspruch, einen
 * 11-kW-AC-Punkt fuer einen Kurzhalt mit weiter Rueckfahrt zu empfehlen und
 * im selben Atemzug als zu langsam zu bezeichnen. Schwelle: classScore >= 0,3
 * schliesst genau den unbrauchbaren Fall (AC bei dc_required, Score 0,05) aus.
 */
export const PRIORITY_MIN_CLASS = 0.3;

/** Naehe: 1 bei 0 m, 0,5 bei 100 m, 0,33 bei 200 m. Vermeidet 1/0. */
export function distanceScore(walkingM: number): number {
  return 1 / (1 + walkingM / 100);
}

/**
 * Passt der Ladepunkt zur Bedarfsklasse? (Konzept §8, Schritt 4/5)
 * Beruecksichtigt die vom Fahrzeug nutzbare Leistung — ein 300-kW-Lader
 * zaehlt nicht mehr als 135 kW (Fahrzeugprofil).
 */
export function classScore(charger: Charger, demand: DemandClass): number {
  const usable =
    charger.connector === "dc"
      ? usableDcPowerKw(charger.powerKw)
      : usableAcPowerKw(charger.powerKw);
  const powerFrac =
    charger.connector === "dc"
      ? usable / VEHICLE.maxDcKw
      : usable / VEHICLE.maxAcKw;

  switch (demand) {
    case "ac_ok":
      // Ueber Nacht: AC 11 kW reicht und ist guenstiger -> bevorzugen.
      return charger.connector === "ac" ? 1.0 : 0.5;
    case "ac_or_dc":
      return charger.connector === "dc"
        ? 0.85 * (0.7 + 0.3 * powerFrac)
        : 0.75 * (0.7 + 0.3 * powerFrac);
    case "dc_required":
      // Kurzer Halt / weite Rueckfahrt: AC ist praktisch unbrauchbar.
      if (charger.connector === "ac") return 0.05;
      return usable >= minUsefulDcKw() ? 0.7 + 0.3 * powerFrac : 0.4;
    default:
      return 0.5;
  }
}

export function availabilityScore(charger: Charger): number {
  switch (charger.status) {
    case "available":
      return 1.0;
    case "occupied":
      return 0.2;
    case "outoforder":
      return 0.0;
    default:
      // "unknown" oder keine Daten: weder belohnen noch abstrafen (Ehrlichkeit).
      return 0.5;
  }
}

export function usablePowerOf(charger: Charger): number {
  return charger.connector === "dc"
    ? usableDcPowerKw(charger.powerKw)
    : usableAcPowerKw(charger.powerKw);
}

/**
 * Bewertet und sortiert Kandidaten (Konzept §8). Ladepunkte AM Ziel
 * (atDestination) kommen immer zuerst, unabhaengig von der Leistung
 * (Schritt 3). Radius-Erweiterung passiert vorgelagert in plan.ts.
 */
export function rankChargers(
  candidates: Charger[],
  destination: Coordinates,
  demand: DemandClass,
): RankedCharger[] {
  const scored = candidates.map((charger) => {
    const airlineM = Math.round(
      haversineMeters(destination, { lat: charger.lat, lng: charger.lng }),
    );
    const walkingM = charger.atDestination
      ? Math.min(estimateWalkingMeters(airlineM), airlineM || 15)
      : estimateWalkingMeters(airlineM);
    const dScore = distanceScore(walkingM);
    const cScore = classScore(charger, demand);
    const aScore = availabilityScore(charger);
    const score =
      WEIGHTS.distance * dScore +
      WEIGHTS.class * cScore +
      WEIGHTS.availability * aScore;

    return {
      charger,
      rank: 0,
      airlineM,
      walkingM,
      usablePowerKw: usablePowerOf(charger),
      distanceScore: round3(dScore),
      classScore: round3(cScore),
      availabilityScore: round3(aScore),
      score: round3(score),
    } satisfies RankedCharger;
  });

  sortRanked(scored);
  return scored;
}

/** Sortiert eine gerankte Liste (atDestination-Prioritaet, Score, Naehe) und
 * vergibt die Rangnummern neu. Auch nach nachtraeglicher Anreicherung nutzbar. */
export function sortRanked(scored: RankedCharger[]): void {
  scored.sort((a, b) => {
    // atDestination gewinnt — aber nur, wenn der Punkt zur Bedarfsklasse passt
    // (siehe PRIORITY_MIN_CLASS; Verfeinerung von Konzept §8, Schritt 3).
    const aAt = a.charger.atDestination && a.classScore >= PRIORITY_MIN_CLASS ? 1 : 0;
    const bAt = b.charger.atDestination && b.classScore >= PRIORITY_MIN_CLASS ? 1 : 0;
    if (aAt !== bAt) return bAt - aAt;
    if (b.score !== a.score) return b.score - a.score;
    // Gleichstand: naeher gewinnt.
    return a.walkingM - b.walkingM;
  });
  scored.forEach((r, i) => (r.rank = i + 1));
}

/** Bewertet Verfuegbarkeit + Gesamt-Score neu (nach Live-Anreicherung). */
export function rescoreAvailability(r: RankedCharger): void {
  const a = availabilityScore(r.charger);
  r.availabilityScore = round3(a);
  r.score = round3(
    WEIGHTS.distance * r.distanceScore +
      WEIGHTS.class * r.classScore +
      WEIGHTS.availability * a,
  );
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
