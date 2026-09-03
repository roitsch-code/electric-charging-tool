import type { ChargerStatus } from "../chargers/types";
import type { StatusRecord } from "./types";

/**
 * MobiData-BW-Realtime-Client (Konzept §5.1). Oeffentlicher AFIR/DATEX-II-
 * Endpunkt, kein Key, kein Onboarding — Referenzimplementierung fuer den
 * Realtime-Layer. Liefert DATEX II v3.5 (EnergyInfrastructureStatus).
 *
 * IDs (`BNETZA*<id>*<punkt>`) passen zu den statischen OCPDB-IDs (siehe
 * import/ocpdb.ts) — nur dann lassen sich Statuswerte zuordnen.
 */

export const MOBIDATA_REALTIME_URL =
  "https://api.mobidata-bw.de/ocpdb/api/public/datex/v3.5/json/realtime";

const SOURCE = "mobidata-bw";

/** DATEX-Statuswert -> interner ChargerStatus. */
export function mapDatexStatus(value: string | undefined): ChargerStatus {
  switch ((value ?? "").toLowerCase()) {
    case "available":
      return "available";
    case "charging":
    case "occupied":
    case "reserved":
    case "blocked":
      return "occupied";
    case "outoforder":
    case "inoperative":
    case "outofservice":
    case "faulted":
      return "outoforder";
    default:
      return "unknown";
  }
}

interface RefillPointStatusWrap {
  aegiRefillPointStatus?: {
    reference?: { idG?: string };
    lastUpdated?: string;
    status?: { value?: string };
  };
}
interface RealtimePayload {
  payload?: {
    aegiEnergyInfrastructureStatusPublication?: {
      publicationTime?: string;
      energyInfrastructureSiteStatus?: Array<{
        energyInfrastructureStationStatus?: Array<{
          refillPointStatus?: RefillPointStatusWrap[];
        }>;
      }>;
    };
  };
}

/** Parst die MobiData-BW-Realtime-Antwort zu StatusRecords. */
export function parseMobidataRealtime(json: unknown): StatusRecord[] {
  const data = (json ?? {}) as RealtimePayload;
  const sites =
    data.payload?.aegiEnergyInfrastructureStatusPublication
      ?.energyInfrastructureSiteStatus ?? [];
  const fallbackTime =
    data.payload?.aegiEnergyInfrastructureStatusPublication?.publicationTime ??
    new Date().toISOString();

  const records: StatusRecord[] = [];
  for (const site of sites) {
    for (const station of site.energyInfrastructureStationStatus ?? []) {
      for (const wrap of station.refillPointStatus ?? []) {
        const rp = wrap.aegiRefillPointStatus;
        const evseId = rp?.reference?.idG;
        if (!evseId) continue;
        records.push({
          evseId,
          status: mapDatexStatus(rp?.status?.value),
          lastUpdated: rp?.lastUpdated ?? fallbackTime,
          source: SOURCE,
        });
      }
    }
  }
  return records;
}

export async function fetchMobidataRealtime(
  url = MOBIDATA_REALTIME_URL,
): Promise<StatusRecord[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "ladeplanner/0.1 (n=1 hobby project)" },
  });
  if (!res.ok) throw new Error(`MobiData realtime ${res.status}`);
  return parseMobidataRealtime(await res.json());
}
