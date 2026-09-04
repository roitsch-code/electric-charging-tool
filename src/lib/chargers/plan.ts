import type { AvailabilityProvider } from "@/lib/availability/types";
import { applySnapshot, nearestSnapshot } from "@/lib/availability/enrich";
import type { Coordinates } from "@/lib/resolver/types";
import { demandClass } from "@/lib/vehicle";
import { rankChargers, rescoreAvailability, sortRanked } from "./rank";
import { seedSource } from "./seed";
import type { Charger, ChargerSource, PlanInput, PlanResult, RankedCharger } from "./types";

/** Suchradien in Metern (Konzept §8, Schritt 1/2). */
export const SEARCH_RADII_M = [500, 1000, 2000];

/** So viele Top-Kandidaten werden mit Live-Belegung angereichert (Kosten-Deckel). */
const ENRICH_TOP = 8;

/**
 * Kompletter Planungsschritt fuer ein aufgeloestes Ziel (Konzept §8):
 * Kandidaten im wachsenden Radius laden, Bedarfsklasse bestimmen, ranken,
 * optional die Top-Kandidaten mit Live-Belegung anreichern, Top 3 zurueckgeben.
 */
export async function planDestination(
  destination: Coordinates & { name?: string },
  input: PlanInput,
  source: ChargerSource = seedSource,
  availability?: AvailabilityProvider | null,
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

  // Live-Belegung on-demand fuer die Top-Kandidaten (Konzept §5.1).
  if (availability && ranked.length > 0) {
    try {
      const snaps = await availability.near(destination, usedRadiusM);
      if (snaps.length > 0) {
        for (const r of ranked.slice(0, ENRICH_TOP)) {
          const snap = nearestSnapshot(r.charger, snaps);
          if (snap) {
            applySnapshot(r, snap);
            rescoreAvailability(r);
          }
        }
        sortRanked(ranked);
      }
    } catch {
      // Belegung ist optional: bei Fehler bleibt es beim statischen Ranking.
    }
  }

  const top = ranked.slice(0, 3);
  return {
    destination,
    demandClass: demand,
    usedRadiusM,
    expanded: usedRadiusM > SEARCH_RADII_M[0]! && candidates.length > 0,
    candidateCount: candidates.length,
    top,
    dataTimestamp: newestTimestamp(ranked.map((r) => r.charger)),
  };
}

function newestTimestamp(chargers: Charger[]): string | null {
  const stamps = chargers
    .map((c) => c.statusUpdatedAt)
    .filter((s): s is string => Boolean(s))
    .sort();
  return stamps.length ? stamps[stamps.length - 1]! : null;
}

export type { RankedCharger };
