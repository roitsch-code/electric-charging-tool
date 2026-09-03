import type { Coordinates } from "@/lib/resolver/types";
import { demandClass } from "@/lib/vehicle";
import { rankChargers } from "./rank";
import { seedSource } from "./seed";
import type { Charger, ChargerSource, PlanInput, PlanResult } from "./types";

/** Suchradien in Metern (Konzept §8, Schritt 1/2). */
export const SEARCH_RADII_M = [500, 1000, 2000];

/**
 * Kompletter Planungsschritt fuer ein aufgeloestes Ziel (Konzept §8):
 * Kandidaten im wachsenden Radius laden, Bedarfsklasse bestimmen, ranken,
 * Top 3 zurueckgeben — inklusive Radius-Erweiterungs-Flag und
 * Datenaktualitaet fuer die Ehrlichkeitsanzeige (§5.1).
 */
export async function planDestination(
  destination: Coordinates & { name?: string },
  input: PlanInput,
  source: ChargerSource = seedSource,
): Promise<PlanResult> {
  const demand = demandClass(input.dwellMinutes, input.returnTripKm);

  let candidates: Charger[] = [];
  let usedRadiusM = SEARCH_RADII_M[0]!;
  for (const radius of SEARCH_RADII_M) {
    usedRadiusM = radius;
    candidates = await source.within(destination, radius);
    if (candidates.length > 0) break;
  }

  const ranked = rankChargers(candidates, destination, demand);

  return {
    destination,
    demandClass: demand,
    usedRadiusM,
    expanded: usedRadiusM > SEARCH_RADII_M[0]! && candidates.length > 0,
    candidateCount: candidates.length,
    top: ranked.slice(0, 3),
    dataTimestamp: newestTimestamp(candidates),
  };
}

function newestTimestamp(chargers: Charger[]): string | null {
  const stamps = chargers
    .map((c) => c.statusUpdatedAt)
    .filter((s): s is string => Boolean(s))
    .sort();
  return stamps.length ? stamps[stamps.length - 1]! : null;
}
