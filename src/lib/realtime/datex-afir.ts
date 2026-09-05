import type { ChargerStatus } from "@/lib/chargers/types";

/**
 * Parser fuer den AFIR-Dynamic-Feed der Mobilithek (Road B.V.), DATEX II v3
 * in JSON. Der Feed liefert je Ladepunkt (idG) nur den Belegungsstatus —
 * KEINE Koordinaten/EVSE-ID. Das Mapping idG -> Ort/EVSE kommt aus dem
 * AFIR-*Static*-Datensatz (separates Abo).
 *
 * Struktur (verifiziert an echten Daten, 2026-09):
 *   messageContainer.payload[]
 *     .aegiEnergyInfrastructureStatusPublication
 *       .publicationTime, .headerInformation.informationStatus.value
 *       .energyInfrastructureSiteStatus[]
 *         .energyInfrastructureStationStatus[]
 *           .refillPointStatus[]
 *             .aegiElectricChargingPointStatus
 *               .reference.idG        (Ladepunkt-UUID)
 *               .status.value         ("available" | "occupied" | ...)
 *               .lastUpdated
 */

export interface AfirPointStatus {
  pointId: string; // reference.idG des Ladepunkts
  status: ChargerStatus; // normalisiert
  rawStatus: string; // Originalwert aus DATEX
  lastUpdated: string | null; // ISO
}

export interface AfirDynamicResult {
  publicationTime: string | null;
  /** "test" solange der Anbieter Testdaten liefert, sonst z. B. "real". */
  informationStatus: string | null;
  points: AfirPointStatus[];
}

/** DATEX-Statuswerte -> interne ChargerStatus. */
export function mapAfirStatus(value: string | undefined | null): ChargerStatus {
  switch ((value ?? "").toLowerCase()) {
    case "available":
      return "available";
    case "occupied":
    case "inuse":
    case "reserved":
      return "occupied";
    case "outofservice":
    case "outoforder":
    case "faulted":
    case "unavailable":
      return "outoforder";
    default:
      return "unknown";
  }
}

type Json = Record<string, unknown>;
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const asObj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/**
 * Parst einen AFIR-Dynamic-Payload (String oder bereits geparstes Objekt) und
 * gibt die Statusliste je Ladepunkt zurueck. Defensiv gegen fehlende Ebenen.
 */
export function parseAfirDynamic(input: string | Json): AfirDynamicResult {
  const root: Json = typeof input === "string" ? (safeParse(input) ?? {}) : input;
  const container = asObj(root.messageContainer);
  const payloads = asArray(container.payload);

  const points: AfirPointStatus[] = [];
  let publicationTime: string | null = null;
  let informationStatus: string | null = null;

  for (const p of payloads) {
    const pub = asObj(asObj(p).aegiEnergyInfrastructureStatusPublication);
    publicationTime = publicationTime ?? str(pub.publicationTime);
    informationStatus =
      informationStatus ??
      str(asObj(asObj(pub.headerInformation).informationStatus).value);

    for (const site of asArray(pub.energyInfrastructureSiteStatus)) {
      for (const station of asArray(asObj(site).energyInfrastructureStationStatus)) {
        for (const refill of asArray(asObj(station).refillPointStatus)) {
          const cp = asObj(asObj(refill).aegiElectricChargingPointStatus);
          const pointId = str(asObj(cp.reference).idG);
          if (!pointId) continue;
          const rawStatus = str(asObj(cp.status).value) ?? "";
          points.push({
            pointId,
            status: mapAfirStatus(rawStatus),
            rawStatus,
            lastUpdated: str(cp.lastUpdated),
          });
        }
      }
    }
  }

  return { publicationTime, informationStatus, points };
}

function safeParse(s: string): Json | null {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? (v as Json) : null;
  } catch {
    return null;
  }
}
