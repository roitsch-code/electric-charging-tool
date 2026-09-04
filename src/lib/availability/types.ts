import type { ChargerStatus } from "@/lib/chargers/types";
import type { Coordinates } from "@/lib/resolver/types";

/** Eine Live-Belegungsmomentaufnahme fuer einen Ladeort. */
export interface AvailabilitySnapshot {
  lat: number;
  lng: number;
  name?: string;
  status: ChargerStatus;
  /** aktuell freie Punkte */
  available: number;
  /** Gesamtzahl (frei + belegt + reserviert + unbekannt + defekt) */
  total: number;
  /** ISO-Zeitstempel des Abrufs (Ehrlichkeitsgebot §5.1). */
  fetchedAt: string;
}

/**
 * Liefert Live-Belegung fuer die Umgebung eines Ziels. On-demand statt
 * DB-Poller: nur die wenigen Ladeorte am Ziel werden abgefragt.
 */
export interface AvailabilityProvider {
  near(center: Coordinates, radiusM: number): Promise<AvailabilitySnapshot[]>;
}
