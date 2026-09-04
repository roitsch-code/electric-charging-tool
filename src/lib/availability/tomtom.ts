import type { ChargerStatus } from "@/lib/chargers/types";
import type { Coordinates } from "@/lib/resolver/types";
import { haversineMeters } from "@/lib/chargers/geo";
import type { AvailabilityProvider, AvailabilitySnapshot } from "./types";

/**
 * TomTom EV Charging Stations Availability (Konzept §5.1, DE-weit, per Key).
 *
 * Zwei Schritte:
 *   1. Category-Search (categorySet 7309 = Electric Vehicle Station) um das
 *      Ziel → Ladeorte inkl. `dataSources.chargingAvailability.id`.
 *   2. Availability-Endpoint je ID → Zaehler available/occupied/reserved/
 *      unknown/outOfService (3-Min-Refresh bei TomTom).
 *
 * On-demand und gedeckelt: 1 Suche + hoechstens MAX_LOOKUPS Availability-
 * Abrufe pro Planung — fuer n=1 praktisch kostenlos.
 */

const BASE = "https://api.tomtom.com";
const MAX_LOOKUPS = 10;
const TIMEOUT_MS = 6000;

interface TomTomCurrent {
  available?: number;
  occupied?: number;
  reserved?: number;
  unknown?: number;
  outOfService?: number;
}
interface TomTomConnector {
  type?: string;
  total?: number;
  availability?: { current?: TomTomCurrent };
}
interface TomTomAvailabilityResponse {
  connectors?: TomTomConnector[];
}

/** Aggregiert die Connector-Zaehler zu einem Gesamtstatus. */
export function aggregateTomTomStatus(res: TomTomAvailabilityResponse): {
  status: ChargerStatus;
  available: number;
  total: number;
} {
  let a = 0, o = 0, r = 0, u = 0, x = 0;
  for (const c of res.connectors ?? []) {
    const cur = c.availability?.current;
    a += cur?.available ?? 0;
    o += cur?.occupied ?? 0;
    r += cur?.reserved ?? 0;
    u += cur?.unknown ?? 0;
    x += cur?.outOfService ?? 0;
  }
  const total = a + o + r + u + x;
  let status: ChargerStatus = "unknown";
  if (a > 0) status = "available";
  else if (o > 0 || r > 0) status = "occupied";
  else if (x > 0) status = "outoforder";
  return { status, available: a, total };
}

interface SearchResult {
  lat: number;
  lng: number;
  name?: string;
  availabilityId: string;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`tomtom ${res.status}`);
  return res.json();
}

interface SearchApiResult {
  poi?: { name?: string };
  position?: { lat?: number; lon?: number };
  info?: string;
  dataSources?: { chargingAvailability?: { id?: string } };
}

const INFO_PREFIX = "search:ev:";

/** Availability-ID: bevorzugt dataSources, sonst aus dem info-Feld. */
function availabilityIdOf(r: SearchApiResult): string | undefined {
  const fromSource = r.dataSources?.chargingAvailability?.id;
  if (fromSource) return fromSource;
  if (typeof r.info === "string" && r.info.startsWith(INFO_PREFIX)) {
    return r.info.slice(INFO_PREFIX.length);
  }
  return undefined;
}

export async function searchTomTomEv(
  center: Coordinates,
  radiusM: number,
  key: string,
): Promise<SearchResult[]> {
  // poiSearch mit echtem Suchbegriff. WICHTIG (verifiziert 2026-09): weder
  // categorySearch/EV noch poiSearch MIT categorySet=7309 liefern Treffer —
  // erst der reine Textquery "charging station" gibt die EV-Stationen zurueck.
  const url =
    `${BASE}/search/2/poiSearch/charging%20station.json?key=${encodeURIComponent(key)}` +
    `&lat=${center.lat}&lon=${center.lng}&radius=${Math.max(radiusM, 100)}&limit=20`;
  const data = (await getJson(url)) as { results?: SearchApiResult[] };
  const out: SearchResult[] = [];
  for (const r of data.results ?? []) {
    const id = availabilityIdOf(r);
    const lat = r.position?.lat;
    const lng = r.position?.lon;
    if (!id || typeof lat !== "number" || typeof lng !== "number") continue;
    out.push({ lat, lng, name: r.poi?.name, availabilityId: id });
  }
  return out;
}

export async function fetchTomTomAvailability(
  id: string,
  key: string,
): Promise<TomTomAvailabilityResponse> {
  const url = `${BASE}/search/2/chargingAvailability.json?key=${encodeURIComponent(
    key,
  )}&chargingAvailability=${encodeURIComponent(id)}`;
  return (await getJson(url)) as TomTomAvailabilityResponse;
}

export class TomTomAvailabilityProvider implements AvailabilityProvider {
  constructor(private readonly key: string) {}

  async near(center: Coordinates, radiusM: number): Promise<AvailabilitySnapshot[]> {
    const found = await searchTomTomEv(center, radiusM, this.key);
    // Nur die naechsten MAX_LOOKUPS abfragen (Kosten deckeln).
    const nearest = found
      .map((f) => ({ f, d: haversineMeters(center, { lat: f.lat, lng: f.lng }) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_LOOKUPS)
      .map((x) => x.f);

    const fetchedAt = new Date().toISOString();
    const snapshots = await Promise.all(
      nearest.map(async (f): Promise<AvailabilitySnapshot | null> => {
        try {
          const res = await fetchTomTomAvailability(f.availabilityId, this.key);
          const agg = aggregateTomTomStatus(res);
          return {
            lat: f.lat,
            lng: f.lng,
            name: f.name,
            status: agg.status,
            available: agg.available,
            total: agg.total,
            fetchedAt,
          };
        } catch {
          return null;
        }
      }),
    );
    return snapshots.filter((s): s is AvailabilitySnapshot => s !== null);
  }
}
