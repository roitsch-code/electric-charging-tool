import type { Coordinates } from "@/lib/resolver/types";

const EARTH_RADIUS_M = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Luftlinie zwischen zwei Punkten in Metern (Haversine). Fuer die
 * Kandidatenauswahl (Konzept §8, Schritt 1 "Luftlinie").
 */
export function haversineMeters(a: Coordinates, b: Coordinates): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Grobe Gehdistanz-Schaetzung aus der Luftlinie. GESCHAETZT: Umwegfaktor
 * 1,3 als Platzhalter, bis OpenRouteService/Valhalla echte Gehwege liefert
 * (Konzept §5.2). Bewusst konservativ (eher zu weit als zu kurz).
 */
export function estimateWalkingMeters(airlineMeters: number): number {
  return Math.round(airlineMeters * 1.3);
}
