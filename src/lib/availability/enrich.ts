import { haversineMeters } from "@/lib/chargers/geo";
import type { RankedCharger } from "@/lib/chargers/types";
import type { AvailabilitySnapshot } from "./types";

/** Max. Abstand (m), bis zu dem ein Snapshot als "derselbe Ladeort" gilt. */
export const MATCH_THRESHOLD_M = 80;

/** Naechster Snapshot zu einem Ladepunkt innerhalb des Schwellwerts. */
export function nearestSnapshot(
  charger: { lat: number; lng: number },
  snapshots: AvailabilitySnapshot[],
  thresholdM = MATCH_THRESHOLD_M,
): AvailabilitySnapshot | null {
  let best: AvailabilitySnapshot | null = null;
  let bestD = Infinity;
  for (const s of snapshots) {
    const d = haversineMeters(charger, { lat: s.lat, lng: s.lng });
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best && bestD <= thresholdM ? best : null;
}

/**
 * Reichert einen gerankten Ladepunkt mit einem Live-Status an — ohne den
 * (ggf. geteilten) Quell-Charger zu mutieren (Klon). Gibt zurueck, ob ein
 * Match gefunden wurde.
 */
export function applySnapshot(
  ranked: RankedCharger,
  snapshot: AvailabilitySnapshot,
): void {
  ranked.charger = {
    ...ranked.charger,
    status: snapshot.status,
    statusUpdatedAt: snapshot.fetchedAt,
  };
}
