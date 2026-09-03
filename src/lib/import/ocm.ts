import type { Charger } from "../chargers/types";
import { deriveConnector, isValidCharger, stableHash } from "./normalize";

/**
 * Open-Charge-Map-Importer (Konzept §5.1). International, statisch, JSON,
 * kostenloser API-Key. Als Ergaenzung zum BNetzA-Register (Eigenschaften,
 * Abdeckung ausserhalb DE).
 *
 * Key holen: https://openchargemap.org/site/develop/api  -> in .env als
 * OCM_API_KEY. Import: `npm run import:ocm -- --country DE`.
 */

export interface OcmConnection {
  PowerKW?: number | null;
  ConnectionType?: { Title?: string; FormalName?: string } | null;
  CurrentType?: { Title?: string } | null;
  Level?: { IsFastChargeCapable?: boolean } | null;
}

export interface OcmPoi {
  ID?: number;
  UUID?: string;
  AddressInfo?: {
    Title?: string;
    AddressLine1?: string;
    Town?: string;
    Postcode?: string;
    Latitude?: number;
    Longitude?: number;
  } | null;
  OperatorInfo?: { Title?: string } | null;
  StatusType?: { IsOperational?: boolean | null } | null;
  Connections?: OcmConnection[] | null;
}

export function mapOcmPoi(poi: OcmPoi): Charger | null {
  const addr = poi.AddressInfo;
  const lat = addr?.Latitude;
  const lng = addr?.Longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  const conns = poi.Connections ?? [];
  const powerKw = conns.reduce<number>((max, c) => {
    const p = typeof c.PowerKW === "number" ? c.PowerKW : 0;
    return p > max ? p : max;
  }, 0);

  const anyDc = conns.some((c) => {
    const current = (c.CurrentType?.Title ?? "").toLowerCase();
    const type = (c.ConnectionType?.Title ?? c.ConnectionType?.FormalName ?? "").toLowerCase();
    return (
      current.includes("dc") ||
      /(ccs|combo|chademo)/.test(type) ||
      c.Level?.IsFastChargeCapable === true
    );
  });
  const connector = anyDc
    ? "dc"
    : deriveConnector({ powerKw: powerKw || null });

  const connectorType = conns
    .map((c) => c.ConnectionType?.Title)
    .filter(Boolean)
    .join(", ");

  const operational = poi.StatusType?.IsOperational;
  const status = operational === false ? "outoforder" : "unknown";

  const idPart = poi.ID != null ? String(poi.ID) : stableHash(`${lat}|${lng}`);
  const address = [addr?.AddressLine1, [addr?.Postcode, addr?.Town].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  const charger: Partial<Charger> = {
    evseId: `OCM-${idPart}`,
    name: addr?.Title || poi.OperatorInfo?.Title || `OCM ${idPart}`,
    lat,
    lng,
    operator: poi.OperatorInfo?.Title || undefined,
    powerKw: powerKw > 0 ? powerKw : undefined,
    connector,
    connectorType: connectorType || undefined,
    address: address || undefined,
    source: "ocm",
    status,
  };

  return isValidCharger(charger) ? charger : null;
}

export function mapOcmPois(pois: OcmPoi[]): Charger[] {
  const out: Charger[] = [];
  const seen = new Set<string>();
  for (const poi of pois) {
    const c = mapOcmPoi(poi);
    if (c && !seen.has(c.evseId)) {
      seen.add(c.evseId);
      out.push(c);
    }
  }
  return out;
}

/** Holt POIs von der OCM-API (fuer das Importskript). */
export async function fetchOcmPois(opts: {
  apiKey: string;
  countryCode?: string;
  maxResults?: number;
  boundingbox?: string;
}): Promise<OcmPoi[]> {
  const params = new URLSearchParams({
    output: "json",
    compact: "true",
    verbose: "false",
    key: opts.apiKey,
    maxresults: String(opts.maxResults ?? 5000),
  });
  if (opts.countryCode) params.set("countrycode", opts.countryCode);
  if (opts.boundingbox) params.set("boundingbox", opts.boundingbox);

  const res = await fetch(`https://api.openchargemap.io/v3/poi?${params.toString()}`, {
    headers: { "User-Agent": "ladeplanner/0.1 (n=1 hobby project)" },
  });
  if (!res.ok) {
    throw new Error(`OCM API ${res.status}: ${await res.text().catch(() => "")}`);
  }
  return (await res.json()) as OcmPoi[];
}
