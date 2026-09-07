import { XMLParser } from "fast-xml-parser";
import type { AvailabilitySnapshot } from "@/lib/availability/types";
import type { Charger, ChargerStatus } from "@/lib/chargers/types";
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
  // Anbieter liefern DATEX II v3 als JSON (Road B.V.) ODER XML (Smartlab/
  // ladenetz). XML automatisch erkennen und passend parsen.
  if (typeof input === "string" && input.trimStart().startsWith("<")) {
    return parseAfirStaticXml(input);
  }
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

// ---------------------------------------------------------------------------
// XML-Variante (Smartlab/ladenetz), DATEX II v3, Standard-Elementnamen.
// Struktur (verifiziert 2026-09):
//   messageContainer.payload.energyInfrastructureTable[]
//     .energyInfrastructureSite[]
//       .locationReference.coordinatesForDisplay { latitude, longitude }
//       .energyInfrastructureStation[]
//         .refillPoint[]  (@_type ns11:ElectricChargingPoint)
//           @_id / externalIdentifier            -> idG / evseId
//           connector[].maxPowerAtSocket (Watt)  -> Leistung
//           connector[].chargingMode / connectorType -> AC | DC
//           locationReference._locationReferenceExtension.facilityLocation.address
// ---------------------------------------------------------------------------

/** Text aus einem XML-Knoten: direkter Wert oder { "#text": … } (mit Attributen). */
function xtext(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "object") {
    const t = (v as Record<string, unknown>)["#text"];
    return t == null ? null : String(t);
  }
  return String(v);
}

/** MultilingualString: .values.value(.#text) — value kann Array sein. */
function xFirstValue(node: unknown): string | null {
  const value = asObj(asObj(node).values).value;
  for (const entry of asArray(value)) {
    const t = xtext(entry);
    if (t) return t;
  }
  return null;
}

function xAddress(cp: Json): string | null {
  const addr = asObj(
    asObj(asObj(asObj(cp.locationReference)._locationReferenceExtension).facilityLocation).address,
  );
  if (Object.keys(addr).length === 0) return null;
  let street: string | null = null;
  let houseNr: string | null = null;
  for (const line of asArray(addr.addressLine)) {
    const o = asObj(line);
    const type = str(o.type);
    const text = xtext(asObj(asObj(o.text).values).value) ?? xFirstValue(o.text);
    if (type === "street") street = text;
    else if (type === "houseNumber") houseNr = text;
  }
  const city = xtext(asObj(asObj(asObj(addr.city).values).value)) ?? xFirstValue(addr.city);
  const streetPart = [street, houseNr].filter(Boolean).join(" ");
  return [streetPart, city].filter(Boolean).join(", ") || null;
}

/** AC vs DC aus connector.chargingMode / connectorType. */
function xConnectorKind(connectors: unknown[]): "ac" | "dc" {
  for (const c of connectors) {
    const o = asObj(c);
    const mode = (str(o.chargingMode) ?? "").toLowerCase();
    const type = (str(o.connectorType) ?? "").toLowerCase();
    if (mode.includes("dc") || type.includes("combo") || type.includes("chademo")) return "dc";
  }
  return "ac";
}

function xMaxPowerKw(cp: Json, connectors: unknown[]): number {
  let maxW = num(cp.availableChargingPower) ?? 0;
  for (const c of connectors) {
    const w = num(asObj(c).maxPowerAtSocket) ?? 0;
    if (w > maxW) maxW = w;
  }
  return Math.round(maxW / 1000);
}

export function parseAfirStaticXml(xml: string): AfirStaticResult {
  const parser = new XMLParser({
    removeNSPrefix: true,
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: true,
    parseAttributeValue: false,
    trimValues: true,
  });
  const root = asObj(parser.parse(xml));
  const payload = asObj(asObj(root.messageContainer).payload);
  const publicationTime = str(payload.publicationTime);

  const points: AfirStaticPoint[] = [];
  for (const table of asArray(payload.energyInfrastructureTable)) {
    for (const site of asArray(asObj(table).energyInfrastructureSite)) {
      const s = asObj(site);
      const siteCoords = asObj(asObj(s.locationReference).coordinatesForDisplay);
      const sLat = num(siteCoords.latitude);
      const sLng = num(siteCoords.longitude);
      const operator = xFirstValue(asObj(s.operator).name);

      for (const station of asArray(s.energyInfrastructureStation)) {
        for (const rp of asArray(asObj(station).refillPoint)) {
          const cp = asObj(rp);
          const pc = asObj(asObj(cp.locationReference).coordinatesForDisplay);
          const lat = num(pc.latitude) ?? sLat;
          const lng = num(pc.longitude) ?? sLng;
          if (lat === null || lng === null) continue;

          const pointId = xtext(cp["@_id"]) ?? xtext(cp.externalIdentifier);
          if (!pointId) continue;
          const connectors = asArray(cp.connector);
          points.push({
            pointId,
            evseId: xtext(cp.externalIdentifier) ?? pointId,
            lat,
            lng,
            connector: xConnectorKind(connectors),
            powerKw: xMaxPowerKw(cp, connectors),
            operator,
            name: xAddress(cp),
          });
        }
      }
    }
  }

  return { publicationTime, informationStatus: "xml", points };
}

/**
 * Aggregiert die AFIR-Static-Ladepunkte je Standort (gleiche Koordinaten) zu
 * einer Station mit Anzahl (`totalPoints`), max. Leistung und Stromart
 * (DC gewinnt, falls gemischt) — die Form, die die App als eine Option zeigt.
 * evseId = stabiler Standort-Schlüssel, damit der Upsert nicht dupliziert.
 */
export function aggregateAfirStations(points: AfirStaticPoint[]): Charger[] {
  const groups = new Map<
    string,
    { lat: number; lng: number; operator: string | null; name: string | null; total: number; maxPower: number; anyDc: boolean }
  >();

  for (const p of points) {
    const key = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
    const g =
      groups.get(key) ??
      { lat: p.lat, lng: p.lng, operator: p.operator, name: p.name, total: 0, maxPower: 0, anyDc: false };
    g.total += 1;
    if (p.powerKw > g.maxPower) g.maxPower = p.powerKw;
    if (p.connector === "dc") g.anyDc = true;
    if (!g.operator && p.operator) g.operator = p.operator;
    if (!g.name && p.name) g.name = p.name;
    groups.set(key, g);
  }

  return [...groups.entries()].map(([key, g]) => ({
    evseId: `AFIR:${key}`,
    // Adresse als Anzeigename bevorzugen (Smartlab-operator ist nur ein Code).
    name: g.name ?? g.operator ?? "Ladepunkt",
    lat: g.lat,
    lng: g.lng,
    operator: g.operator ?? undefined,
    powerKw: g.maxPower,
    connector: g.anyDc ? "dc" : "ac",
    address: g.name ?? undefined,
    source: "afir",
    totalPoints: g.total,
  }));
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
