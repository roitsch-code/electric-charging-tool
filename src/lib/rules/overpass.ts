/**
 * OSM-Overpass-Abfrage für Standzeit-/Öffnungsregeln eines Ladepunkts.
 * Läuft server-seitig (der Broker/Proxy der Agent-Sandbox blockt Overpass).
 * Best-effort: bei Fehler/Timeout -> null, die App zeigt dann "unbekannt".
 */
export type OsmTags = Record<string, string>;

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

/** Tags des nächstgelegenen charging_station-Knotens (mit den meisten Regel-Tags). */
export async function fetchNearestChargingTags(
  coords: { lat: number; lng: number },
  radiusM = 80,
  opts: { fetchFn?: typeof fetch; timeoutMs?: number; endpoints?: string[] } = {},
): Promise<OsmTags | null> {
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 4000;
  const q = `[out:json][timeout:15];(node["amenity"="charging_station"](around:${radiusM},${coords.lat},${coords.lng}););out tags;`;

  for (const base of opts.endpoints ?? ENDPOINTS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchFn(`${base}?data=${encodeURIComponent(q)}`, {
        signal: ctrl.signal,
        headers: { "User-Agent": "ladeplanner/0.1 (n=1 hobby project)" },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { elements?: { tags?: OsmTags }[] };
      return pickBest(data.elements ?? []);
    } catch {
      // nächster Endpunkt
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/** Knoten mit den meisten regelrelevanten Tags (maxstay/opening_hours). */
function pickBest(elements: { tags?: OsmTags }[]): OsmTags | null {
  let best: OsmTags | null = null;
  let bestScore = -1;
  for (const e of elements) {
    const t = e.tags ?? {};
    const score =
      (t["maxstay"] ? 1 : 0) +
      (t["maxstay:conditional"] ? 2 : 0) +
      (t["opening_hours"] ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}
