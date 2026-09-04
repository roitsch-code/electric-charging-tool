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
import { TomTomAvailabilityProvider } from "./tomtom";
import { GoogleAvailabilityProvider } from "./google";
import { CompositeAvailabilityProvider } from "./composite";

/**
 * Baut den Live-Belegungs-Provider aus allen gesetzten Keys (Fallback-Kette:
 * TomTom, dann Google). Ohne Key: null -> App zeigt "Status unbekannt".
 * HERE folgt, sobald ein echtes Sample das Response-Schema bestaetigt.
 */
export function getAvailabilityProvider(): AvailabilityProvider | null {
  const providers: AvailabilityProvider[] = [];
  if (process.env.TOMTOM_API_KEY) {
    providers.push(new TomTomAvailabilityProvider(process.env.TOMTOM_API_KEY));
  }
  if (process.env.GOOGLE_PLACES_API_KEY) {
    providers.push(new GoogleAvailabilityProvider(process.env.GOOGLE_PLACES_API_KEY));
  }
  if (providers.length === 0) return null;
  if (providers.length === 1) return providers[0]!;
  return new CompositeAvailabilityProvider(providers);
}
