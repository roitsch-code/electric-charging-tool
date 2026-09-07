import { fetchTomTomAvailability, aggregateTomTomStatus } from "@/lib/availability/tomtom";
import type { Coordinates } from "@/lib/resolver/types";
import type { Connector } from "@/lib/vehicle";
import { haversineMeters } from "./geo";
import type { Charger, ChargerSource } from "./types";

/**
 * TomTom als vollständige Ladepunkt-Quelle (DE-weit, echtzeit, per Key).
 *
 * Ein poiSearch("charging station") liefert je Station Position, Betreiber,
 * Adresse und `chargingPark.connectors` (connectorType, ratedPowerKW,
 * currentType) — plus `dataSources.chargingAvailability.id` für die
 * Live-Belegung. Verifiziert an SWD Düsseldorf (Ackerstraße 203 = 2× CCS
 * 300 kW, live 1/2 frei).
 *
 * Ersetzt den unsauberen Import + kuratierten Override: eine Quelle, korrekt.
 */

const BASE = "https://api.tomtom.com";
const MAX_LIVE_LOOKUPS = 20;
const TIMEOUT_MS = 7000;

interface TTConnector {
  connectorType?: string;
  ratedPowerKW?: number;
  currentType?: string; // "AC" | "DC"
}
interface TTResult {
  id?: string;
  poi?: { name?: string };
  address?: { freeformAddress?: string; streetName?: string; streetNumber?: string; municipality?: string };
  position?: { lat?: number; lon?: number };
  chargingPark?: { connectors?: TTConnector[] };
  dataSources?: { chargingAvailability?: { id?: string } };
}

/** CCS/CHAdeMO/DC -> dc, sonst ac. Zusätzlich currentType auswerten. */
function connectorKind(connectors: TTConnector[]): Connector {
  for (const c of connectors) {
    const t = (c.connectorType ?? "").toLowerCase();
    const cur = (c.currentType ?? "").toLowerCase();
    if (cur === "dc" || t.includes("ccs") || t.includes("chademo")) return "dc";
  }
  return "ac";
}

function connectorLabel(connectors: TTConnector[]): string | undefined {
  const t = (connectors[0]?.connectorType ?? "").toLowerCase();
  if (t.includes("ccs")) return "CCS";
  if (t.includes("chademo")) return "CHAdeMO";
  if (t.includes("type2")) return "Typ 2";
  return connectors[0]?.connectorType;
}

function maxPowerKw(connectors: TTConnector[]): number {
  let m = 0;
  for (const c of connectors) if ((c.ratedPowerKW ?? 0) > m) m = c.ratedPowerKW!;
  return Math.round(m);
}

/** Düsseldorf/SWD-Standzeitregel (recherchiert): tagsüber 1 Std (DC) / 4 Std
 *  (AC), nachts i. d. R. frei (SWD-Blockiergebühr entfällt 21–08). */
function swdStandzeit(operator: string | undefined, connector: Connector):
  | { label: string; verdict: "free" }
  | undefined {
  if (!/stadtwerke\s*düsseldorf/i.test(operator ?? "")) return undefined;
  return {
    label: connector === "dc" ? "Nachts frei · tagsüber max. 1 Std" : "Nachts frei · tagsüber max. 4 Std",
    verdict: "free",
  };
}

async function searchEv(center: Coordinates, radiusM: number, key: string): Promise<TTResult[]> {
  const url =
    `${BASE}/search/2/poiSearch/charging%20station.json?key=${encodeURIComponent(key)}` +
    `&lat=${center.lat}&lon=${center.lng}&radius=${Math.max(radiusM, 100)}&limit=50`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`tomtom search ${res.status}`);
  const data = (await res.json()) as { results?: TTResult[] };
  return data.results ?? [];
}

export class TomTomChargerSource implements ChargerSource {
  constructor(private readonly key: string) {}

  async within(center: Coordinates, radiusM: number): Promise<Charger[]> {
    const results = await searchEv(center, radiusM, this.key);

    const withDist = results
      .map((r) => {
        const lat = r.position?.lat;
        const lng = r.position?.lon;
        if (typeof lat !== "number" || typeof lng !== "number") return null;
        const d = haversineMeters(center, { lat, lng });
        return d <= radiusM ? { r, lat, lng, d } : null;
      })
      .filter((x): x is { r: TTResult; lat: number; lng: number; d: number } => x !== null)
      .sort((a, b) => a.d - b.d);

    // TomTom liefert denselben Standort oft als mehrere Einträge (Connector-
    // Gruppen/Betreiber). Nach Standort zusammenfassen -> eine Station mit
    // allen Ladepunkten statt vieler 1/1-Krümel. Schlüssel: Adresse, sonst
    // gerundete Koordinaten.
    const groups = new Map<string, { items: typeof withDist; lat: number; lng: number; d: number }>();
    for (const x of withDist) {
      const key = (x.r.address?.freeformAddress ?? `${x.lat.toFixed(5)},${x.lng.toFixed(5)}`).toLowerCase();
      const g = groups.get(key);
      if (g) g.items.push(x);
      else groups.set(key, { items: [x], lat: x.lat, lng: x.lng, d: x.d });
    }
    const ordered = [...groups.values()].sort((a, b) => a.d - b.d);

    // Live-Abruf-Budget über alle Gruppen (nächste zuerst).
    let budget = MAX_LIVE_LOOKUPS;

    return Promise.all(
      ordered.map(async (g): Promise<Charger> => {
        const first = g.items[0]!.r;
        const connectors = g.items.flatMap((x) => x.r.chargingPark?.connectors ?? []);
        const connector = connectorKind(connectors);
        const operator = first.poi?.name;
        const address = first.address?.freeformAddress;

        // Live-Belegung aller Einträge dieser Gruppe aufsummieren.
        let free = 0, total = 0, haveLive = false;
        for (const x of g.items) {
          const availId = x.r.dataSources?.chargingAvailability?.id;
          if (!availId || budget <= 0) continue;
          budget -= 1;
          try {
            const agg = aggregateTomTomStatus(await fetchTomTomAvailability(availId, this.key));
            free += agg.available;
            total += agg.total;
            haveLive = true;
          } catch {
            /* einzelner Live-Abruf fehlgeschlagen -> ignorieren */
          }
        }

        const freePoints = haveLive ? free : undefined;
        const totalPoints = haveLive && total > 0 ? total : connectors.length || undefined;
        const status: Charger["status"] = !haveLive
          ? "unknown"
          : free > 0
            ? "available"
            : total > 0
              ? "occupied"
              : "unknown";

        const sz = swdStandzeit(operator, connector);
        return {
          evseId: `TT:${first.id ?? `${g.lat},${g.lng}`}`,
          name: address ?? operator ?? "Ladepunkt",
          lat: g.lat,
          lng: g.lng,
          operator,
          powerKw: maxPowerKw(connectors),
          connector,
          connectorType: connectorLabel(connectors),
          address,
          source: "tomtom",
          status,
          statusUpdatedAt: haveLive ? new Date().toISOString() : undefined,
          freePoints,
          totalPoints,
          standzeitLabel: sz?.label,
          standzeitVerdict: sz?.verdict,
        };
      }),
    );
  }
}
