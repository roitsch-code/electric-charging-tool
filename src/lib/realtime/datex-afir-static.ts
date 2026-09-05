import type { AvailabilitySnapshot } from "@/lib/availability/types";
import type { ChargerStatus } from "@/lib/chargers/types";
import type { AfirDynamicResult } from "./datex-afir";

/**
 * Parser fuer den AFIR-*Static*-Feed der Mobilithek (Road B.V.), DATEX II v3
 * JSON. Liefert je Ladepunkt (idG) den Standort, die EVSE-ID, Strom-Art und
 * Leistung — das Gegenstueck zum Dynamic-Feed (der nur den Status liefert).
 *
 * Struktur (verifiziert 2026-09):
 *   payload.aegiEnergyInfrastructureTablePublication
 *     .energyInfrastructureTable[]
 *       .energyInfrastructureSite[]
 *         .locationReference.locAreaLocation.coordinatesForDisplay {latitude, longitude}
 *         .operator.afacAnOrganisation.name.values[].value
 *         .energyInfrastructureStation[]
 *           .refillPoint[]
 *             .aegiElectricChargingPoint
 *               .idG                       (== Dynamic-Ladepunkt-idG)
 *               .externalIdentifier[] -> evseId (typeOfIdentifier.extendedValueG === "evseId")
 *               .currentType.value         ("ac" | "dc")
 *               .connector[].maxPowerAtSocket  (Watt)
 */

export interface AfirStaticPoint {
  pointId: string; // aegiElectricChargingPoint.idG
  evseId: string | null;
  lat: number;
  lng: number;
  connector: "ac" | "dc";
  powerKw: number; // max(maxPowerAtSocket)/1000, gerundet
  operator: string | null;
  name: string | null; // Ort/Adresse, wenn vorhanden
}

export interface AfirStaticResult {
  publicationTime: string | null;
  informationStatus: string | null;
  points: AfirStaticPoint[];
}

type Json = Record<string, unknown>;
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const asObj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Erstes lokalisiertes .values[].value (DATEX MultilingualString). */
function firstValue(v: unknown): string | null {
  const vals = asArray(asObj(v).values);
  for (const entry of vals) {
    const s = str(asObj(entry).value);
    if (s) return s;
  }
  return null;
}

function evseIdOf(cp: Json): string | null {
  for (const id of asArray(cp.externalIdentifier)) {
    const o = asObj(id);
    if (str(asObj(o.typeOfIdentifier).extendedValueG) === "evseId") {
      return str(o.identifier);
    }
  }
  // Fallback: erster externalIdentifier
  const first = asObj(asArray(cp.externalIdentifier)[0]);
  return str(first.identifier);
}

function maxPowerKw(cp: Json): number {
  let maxW = 0;
  for (const c of asArray(cp.connector)) {
    const w = num(asObj(c).maxPowerAtSocket) ?? 0;
    if (w > maxW) maxW = w;
  }
  return Math.round(maxW / 1000);
}

/** Findet die AFIR-Table-Publication, egal ob unter payload{} oder messageContainer.payload[]. */
function tablePublications(root: Json): Json[] {
  const candidates: unknown[] = [];
  const p = root.payload;
  if (Array.isArray(p)) candidates.push(...p);
  else if (p) candidates.push(p);
  candidates.push(...asArray(asObj(root.messageContainer).payload));
  return candidates
    .map((c) => asObj(asObj(c).aegiEnergyInfrastructureTablePublication))
    .filter((pub) => Object.keys(pub).length > 0);
}

export function parseAfirStatic(input: string | Json): AfirStaticResult {
  const root: Json = typeof input === "string" ? (safeParse(input) ?? {}) : input;
  const points: AfirStaticPoint[] = [];
  let publicationTime: string | null = null;
  let informationStatus: string | null = null;

  for (const pub of tablePublications(root)) {
    publicationTime = publicationTime ?? str(pub.publicationTime);
    informationStatus =
      informationStatus ??
      str(asObj(asObj(pub.headerInformation).informationStatus).value);

    for (const table of asArray(pub.energyInfrastructureTable)) {
      for (const site of asArray(asObj(table).energyInfrastructureSite)) {
        const s = asObj(site);
        const coords = asObj(
          asObj(asObj(asObj(s.locationReference).locAreaLocation).coordinatesForDisplay),
        );
        const lat = num(coords.latitude);
        const lng = num(coords.longitude);
        if (lat === null || lng === null) continue;

        const operator = firstValue(asObj(asObj(s.operator).afacAnOrganisation).name);
        const name = siteName(s);

        for (const station of asArray(s.energyInfrastructureStation)) {
          for (const refill of asArray(asObj(station).refillPoint)) {
            const cp = asObj(asObj(refill).aegiElectricChargingPoint);
            const pointId = str(cp.idG);
            if (!pointId) continue;
            points.push({
              pointId,
              evseId: evseIdOf(cp),
              lat,
              lng,
              connector: str(asObj(cp.currentType).value) === "dc" ? "dc" : "ac",
              powerKw: maxPowerKw(cp),
              operator,
              name,
            });
          }
        }
      }
    }
  }

  return { publicationTime, informationStatus, points };
}

/** Ort + Straße aus der FacilityLocation-Adresse, wenn vorhanden. */
function siteName(site: Json): string | null {
  const addr = asObj(
    asObj(
      asObj(asObj(asObj(site.locationReference).locAreaLocation).locLocationExtensionG)
        .FacilityLocation,
    ).address,
  );
  const city = firstValue(addr.city);
  const line = firstValue(asObj(asArray(addr.addressLine)[0]).text);
  return [line, city].filter(Boolean).join(", ") || city || null;
}

/**
 * Join: verbindet die Static-Ladepunkte (idG -> Ort) mit den Dynamic-Status
 * (idG -> frei/belegt) zu Availability-Snapshots. Aggregiert je Standort
 * (gleiche Koordinaten) zu "X von Y frei".
 */
export function buildAfirSnapshots(
  staticPoints: AfirStaticPoint[],
  dynamic: AfirDynamicResult,
): AvailabilitySnapshot[] {
  const byId = new Map<string, AfirStaticPoint>();
  for (const p of staticPoints) byId.set(p.pointId, p);

  // je Standort (lat,lng) aggregieren
  const groups = new Map<
    string,
    { lat: number; lng: number; name: string | null; available: number; total: number }
  >();

  for (const d of dynamic.points) {
    const sp = byId.get(d.pointId);
    if (!sp) continue; // Status ohne bekannten Standort -> ignorieren
    const key = `${sp.lat.toFixed(6)},${sp.lng.toFixed(6)}`;
    const g =
      groups.get(key) ??
      { lat: sp.lat, lng: sp.lng, name: sp.name, available: 0, total: 0 };
    g.total += 1;
    if (d.status === "available") g.available += 1;
    groups.set(key, g);
  }

  const fetchedAt = dynamic.publicationTime ?? new Date().toISOString();
  const out: AvailabilitySnapshot[] = [];
  for (const g of groups.values()) {
    const status: ChargerStatus = g.available > 0 ? "available" : "occupied";
    out.push({
      lat: g.lat,
      lng: g.lng,
      name: g.name ?? undefined,
      status,
      available: g.available,
      total: g.total,
      fetchedAt,
    });
  }
  return out;
}

function safeParse(s: string): Json | null {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? (v as Json) : null;
  } catch {
    return null;
  }
}
