export type { AvailabilityProvider, AvailabilitySnapshot } from "./types";
export {
  TomTomAvailabilityProvider,
  aggregateTomTomStatus,
  searchTomTomEv,
  fetchTomTomAvailability,
} from "./tomtom";
export { nearestSnapshot, applySnapshot, MATCH_THRESHOLD_M } from "./enrich";

import type { AvailabilityProvider } from "./types";
import { TomTomAvailabilityProvider } from "./tomtom";

/**
 * Waehlt den Live-Belegungs-Provider. Aktiv nur, wenn ein Key gesetzt ist —
 * sonst null (App zeigt weiter "Status unbekannt").
 */
export function getAvailabilityProvider(): AvailabilityProvider | null {
  const key = process.env.TOMTOM_API_KEY;
  return key ? new TomTomAvailabilityProvider(key) : null;
}
