import type { Coordinates } from "@/lib/resolver/types";
import type { Charger } from "./types";

/**
 * Google-Maps-Deeplinks fuer die Navigationsuebergabe (Konzept §6.7).
 * Kein Eigenbau — zwei Links reichen.
 */

/** Autofahrt zu beliebigen Koordinaten (z. B. direkt zum Ziel). */
export function driveToUrl(target: Coordinates): string {
  const dest = `${target.lat},${target.lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    dest,
  )}&travelmode=driving`;
}

/** Autofahrt zum Ladepunkt. */
export function driveToChargerUrl(charger: Charger): string {
  return driveToUrl(charger);
}

/**
 * Fussweg vom Ladepunkt zum eigentlichen Ziel. Nimmt bewusst nur Koordinaten:
 * Der Startpunkt ist mal ein voller Charger, mal nur die gespeicherte Position
 * der ueberwachten Saeule — mehr als lat/lng braucht der Link nie.
 */
export function walkFromChargerUrl(
  charger: Coordinates,
  destination: Coordinates,
): string {
  const origin = `${charger.lat},${charger.lng}`;
  const dest = `${destination.lat},${destination.lng}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
    origin,
  )}&destination=${encodeURIComponent(dest)}&travelmode=walking`;
}
