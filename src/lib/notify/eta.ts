import { haversineMeters } from "@/lib/chargers";
import type { Coordinates } from "@/lib/resolver/types";

/**
 * Ankunftszeit-Schaetzung (Konzept §6.3). Zwei Wege:
 *
 *  1. Google Directions mit `departure_time=now` -> `duration_in_traffic`
 *     (echte Live-Verkehrslage). Braucht GOOGLE_DIRECTIONS_API_KEY (oder faellt
 *     auf GOOGLE_PLACES_API_KEY zurueck, wenn dort die Directions-API aktiv ist).
 *  2. Fallback ohne Key: Luftlinie x Umwegfaktor 1,3, dann ein grobes
 *     Geschwindigkeitsmodell nach Distanz. GESCHAETZT — bewusst konservativ.
 */

export type EtaSource = "google" | "estimated";

export interface EtaResult {
  etaSeconds: number; // Fahrtdauer ab jetzt
  distanceKm: number; // Fahrstrecke (nicht Luftlinie)
  source: EtaSource;
}

type FetchFn = typeof fetch;

/**
 * Grobes Geschwindigkeitsmodell (km/h) nach Fahrstrecke. Kurzstrecke ist
 * staedtisch/langsam, Langstrecke ueberwiegend Autobahn.
 */
function averageSpeedKmh(roadKm: number): number {
  if (roadKm < 20) return 45;
  if (roadKm <= 100) return 70;
  return 95;
}

/** ETA ohne externen Dienst: Luftlinie -> Fahrstrecke -> Dauer. */
export function estimateEta(origin: Coordinates, dest: Coordinates): EtaResult {
  const airlineKm = haversineMeters(origin, dest) / 1000;
  const roadKm = airlineKm * 1.3;
  const speed = averageSpeedKmh(roadKm);
  const etaSeconds = Math.round((roadKm / speed) * 3600);
  return { etaSeconds, distanceKm: Math.round(roadKm * 10) / 10, source: "estimated" };
}

interface GoogleDirectionsLeg {
  distance?: { value?: number };
  duration?: { value?: number };
  duration_in_traffic?: { value?: number };
}
interface GoogleDirectionsResponse {
  status?: string;
  routes?: { legs?: GoogleDirectionsLeg[] }[];
}

/** ETA via Google Directions (Live-Verkehr). Wirft bei Fehler/leerem Ergebnis. */
export async function googleEta(
  origin: Coordinates,
  dest: Coordinates,
  apiKey: string,
  fetchFn: FetchFn = fetch,
): Promise<EtaResult> {
  const params = new URLSearchParams({
    origin: `${origin.lat},${origin.lng}`,
    destination: `${dest.lat},${dest.lng}`,
    departure_time: "now", // schaltet duration_in_traffic frei
    mode: "driving",
    key: apiKey,
  });
  const res = await fetchFn(
    `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`,
  );
  if (!res.ok) throw new Error(`directions-http-${res.status}`);
  const data = (await res.json()) as GoogleDirectionsResponse;
  if (data.status && data.status !== "OK") {
    throw new Error(`directions-status-${data.status}`);
  }
  const leg = data.routes?.[0]?.legs?.[0];
  const seconds = leg?.duration_in_traffic?.value ?? leg?.duration?.value;
  const meters = leg?.distance?.value;
  if (typeof seconds !== "number" || typeof meters !== "number") {
    throw new Error("directions-empty");
  }
  return {
    etaSeconds: seconds,
    distanceKm: Math.round((meters / 1000) * 10) / 10,
    source: "google",
  };
}

/**
 * Beste verfuegbare ETA: Google wenn ein Key da ist, sonst (oder bei Fehler)
 * die Schaetzung. So funktioniert der Push auch ohne Directions-Kontingent.
 */
export async function computeEta(
  origin: Coordinates,
  dest: Coordinates,
  opts: { apiKey?: string | null; fetchFn?: FetchFn } = {},
): Promise<EtaResult> {
  const key = opts.apiKey ?? null;
  if (key) {
    try {
      return await googleEta(origin, dest, key, opts.fetchFn ?? fetch);
    } catch {
      // Directions nicht verfuegbar -> Schaetzung, damit der Push trotzdem plant.
    }
  }
  return estimateEta(origin, dest);
}

/** Liest den Directions-Key aus der Umgebung (eigener Key oder Places-Key). */
export function directionsKeyFromEnv(): string | null {
  return (
    process.env.GOOGLE_DIRECTIONS_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY ||
    null
  );
}
