export type { AvailabilityProvider, AvailabilitySnapshot } from "./types";
export {
  TomTomAvailabilityProvider,
  aggregateTomTomStatus,
  searchTomTomEv,
  fetchTomTomAvailability,
} from "./tomtom";
export { GoogleAvailabilityProvider, aggregateGoogleStatus } from "./google";
export { CompositeAvailabilityProvider, mergeSnapshots } from "./composite";
export { nearestSnapshot, applySnapshot, MATCH_THRESHOLD_M } from "./enrich";

import type { AvailabilityProvider } from "./types";
import { GoogleAvailabilityProvider } from "./google";

/**
 * Baut den Live-Belegungs-Provider aus allen gesetzten Keys (Fallback-Kette:
 * TomTom, dann Google). Ohne Key: null -> App zeigt "Status unbekannt".
 * HERE folgt, sobald ein echtes Sample das Response-Schema bestaetigt.
 */
export function getAvailabilityProvider(): AvailabilityProvider | null {
  // Bei aktiver TomTom-Quelle liefert diese die Live-Belegung bereits mit —
  // ein zweiter Provider würde denselben Aufruf doppeln. Nur wenn KEIN TomTom
  // (Quelle = Seed/PostGIS), aber ein Google-Key vorhanden ist, ergänzen.
  if (process.env.TOMTOM_API_KEY) return null;
  if (process.env.GOOGLE_PLACES_API_KEY) {
    return new GoogleAvailabilityProvider(process.env.GOOGLE_PLACES_API_KEY);
  }
  return null;
}
