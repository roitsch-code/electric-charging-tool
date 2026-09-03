import type { Coordinates } from "@/lib/resolver/types";
import type { Connector, DemandClass } from "@/lib/vehicle";

/** Verfuegbarkeitsstatus. "unknown" wenn keine Realtime-Daten (Konzept §5.1). */
export type ChargerStatus = "available" | "occupied" | "outoforder" | "unknown";

/** Ein Ladepunkt (statischer Bestand + optionaler Realtime-Status). */
export interface Charger {
  evseId: string;
  name: string;
  lat: number;
  lng: number;
  operator?: string;
  powerKw: number;
  connector: Connector;
  address?: string;
  /** Steht der Punkt direkt am Ziel-POI (gleiche Adresse)? Konzept §8, Schritt 3. */
  atDestination?: boolean;
  status?: ChargerStatus;
  /** ISO-Zeitstempel der letzten Statusaktualisierung; fehlt => unbekannt. */
  statusUpdatedAt?: string;
}

/** Ein bewerteter Ladepunkt mit allen Zwischenwerten (nachvollziehbar). */
export interface RankedCharger {
  charger: Charger;
  rank: number;
  airlineM: number;
  walkingM: number;
  /** Vom Fahrzeug tatsaechlich nutzbare Leistung (kW), gedeckelt. */
  usablePowerKw: number;
  distanceScore: number;
  classScore: number;
  availabilityScore: number;
  score: number;
}

export interface PlanInput {
  dwellMinutes: number | null;
  returnTripKm: number | null;
}

export interface PlanResult {
  destination: Coordinates & { name?: string };
  demandClass: DemandClass;
  /** Radius, in dem Kandidaten gefunden wurden (m). */
  usedRadiusM: number;
  /** true, wenn ueber 500 m hinaus gesucht werden musste (Konzept §8, Schritt 2). */
  expanded: boolean;
  candidateCount: number;
  top: RankedCharger[];
  /** Aelteste/relevante Datenaktualitaet fuer die Ehrlichkeitsanzeige (§5.1). */
  dataTimestamp: string | null;
}

/**
 * Quelle fuer Ladepunkte. In M3 ein Seed im Speicher, in M2 eine
 * PostGIS-Umkreissuche — gleiche Signatur, austauschbar.
 */
export interface ChargerSource {
  /** Alle Ladepunkte in `radiusM` (Luftlinie) um `center`. */
  within(center: Coordinates, radiusM: number): Promise<Charger[]>;
}
