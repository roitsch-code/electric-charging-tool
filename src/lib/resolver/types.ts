/**
 * Typen fuer die dreistufige Aufloesung einer Google-Maps-Share-URL
 * zu Koordinaten (Konzept §4).
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

/** Wie die Koordinaten gefunden wurden. Spiegelt Trip.resolutionMethod. */
export type ResolutionMethod = "redirect" | "geocode" | "manual";

export interface ResolvedDestination {
  lat: number;
  lng: number;
  /** Angezeigter Name, sofern aus URL oder Geocoder ableitbar. */
  name?: string;
  method: ResolutionMethod;
}

/**
 * Fehlgeschlagene Aufloesung. `needsManualInput` signalisiert der App,
 * dass Stufe 3 (Eingabefeld) greifen muss (Konzept §4, Stufe 3).
 */
export interface ResolutionFailure {
  ok: false;
  needsManualInput: true;
  /** Aus der URL extrahierter Name, als Vorbelegung fuers Eingabefeld. */
  placeNameHint?: string;
  reason: string;
}

export type ResolutionResult =
  | ({ ok: true } & ResolvedDestination)
  | ResolutionFailure;

/**
 * Folgt HTTP-Redirects und liefert die finale URL. In Tests injiziert,
 * in Produktion ein fetch-basierter Client.
 */
export type UrlFollower = (shortUrl: string) => Promise<string>;

/** Geocoder: Name/Adresse -> Koordinaten (Photon, Nominatim-Fallback). */
export type Geocoder = (query: string) => Promise<ResolvedDestination | null>;
