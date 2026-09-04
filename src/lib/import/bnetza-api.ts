import type { Charger, ChargerStatus } from "../chargers/types";
import type { Connector } from "../vehicle";
import { detectDelimiter, splitCsvLine } from "./bnetza";
import { isValidCharger, looksLikeGermanCoords, parseGermanNumber } from "./normalize";

/**
 * Importer fuer die DE-weite BNetzA-API der Nationalen Leitstelle
 * (Mobilithek-Angebot "BNetzA Liste aus Webserviceschnittstelle", NOW GmbH,
 * nicht gebrokert/Open Data). Normalisiertes 3-Tabellen-Modell:
 *
 *   Ladestation (ladestation_id) → Koordinaten, Betreiber, Adresse, Status
 *   Ladepunkt   (ladepunkt_id, ladepunkt_hk, ladestation_id) → verbindet
 *   Stecker     (ladepunkt_hk, max_ladeleistung_stecker, AC/DC-Flags)
 *
 * Eine App-"Charger"-Einheit = ein Ladepunkt:
 *   - Koordinaten/Betreiber/Adresse aus der Ladestation (via ladestation_id)
 *   - Leistung + AC/DC aus den Steckern (via ladepunkt_hk)
 *
 * evse_id ist im Feed zu ~70 % "Unknown", daher ist die stabile
 * `ladepunkt_id` die EVSE-ID. Dateien sind semikolon-getrennt.
 */

const DC_FLAGS = [
  "stecker_dc_kupplung",
  "stecker_dc_ccs",
  "stecker_dc_chademo",
  "stecker_dc_tesla_kupplung",
];
const TYPE_FLAGS: Array<[string, string]> = [
  ["stecker_ac_typ2_steckdose", "Typ2 Steckdose"],
  ["stecker_ac_type2_kupplung", "Typ2 Kupplung"],
  ["stecker_dc_ccs", "CCS"],
  ["stecker_dc_chademo", "CHAdeMO"],
  ["stecker_dc_kupplung", "DC Kupplung"],
  ["stecker_dc_tesla_kupplung", "Tesla"],
  ["stecker_ac_schucko", "Schuko"],
  ["stecker_ac_cee_5", "CEE"],
];

interface StationInfo {
  lat: number;
  lng: number;
  operator?: string;
  address?: string;
  ort: string;
  status: ChargerStatus;
}

/** Iteriert Datenzeilen und reicht einen spaltennamen-basierten Getter durch. */
function forEachRow(csv: string, cb: (get: (col: string) => string) => void): void {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/);
  let hi = 0;
  while (hi < lines.length && lines[hi]!.trim() === "") hi++;
  if (hi >= lines.length) return;
  const delim = detectDelimiter(lines[hi]!);
  const header = splitCsvLine(lines[hi]!, delim).map((h) => h.trim());
  const idx = new Map(header.map((h, i) => [h, i] as const));
  for (let i = hi + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") continue;
    const parts = splitCsvLine(line, delim);
    cb((col) => {
      const j = idx.get(col);
      return j === undefined ? "" : (parts[j] ?? "");
    });
  }
}

function mapBetriebsstatus(raw: string): ChargerStatus {
  const v = raw.toLowerCase();
  if (/(außer|ausser|outof|stillgelegt|defekt|abgemeldet)/.test(v)) return "outoforder";
  // "In Betrieb" o. Ae. heisst nicht "jetzt frei" -> ohne Realtime: unbekannt.
  return "unknown";
}

function buildAddress(get: (c: string) => string): string | undefined {
  const street = [get("strasse"), get("hausnummer")].filter(Boolean).join(" ");
  const city = [get("plz"), get("ort")].filter(Boolean).join(" ");
  const addr = [street, city].filter(Boolean).join(", ");
  return addr || undefined;
}

export interface BnetzaApiInput {
  ladestationCsv: string;
  ladepunktCsv: string;
  steckerCsv: string;
}

export function parseBnetzaApi(input: BnetzaApiInput): Charger[] {
  // 1) Ladestationen -> Koordinaten/Betreiber/Adresse
  const stationById = new Map<string, StationInfo>();
  forEachRow(input.ladestationCsv, (get) => {
    const lat = parseGermanNumber(get("breitengrad"));
    const lng = parseGermanNumber(get("laengengrad"));
    if (lat === null || lng === null || !looksLikeGermanCoords(lat, lng)) return;
    const id = get("ladestation_id");
    if (!id) return;
    stationById.set(id, {
      lat,
      lng,
      operator:
        get("betreiber_anzeigename") || get("betreiber") || undefined,
      address: buildAddress(get),
      ort: get("ort"),
      status: mapBetriebsstatus(get("betriebsstatus")),
    });
  });

  // 2) Stecker -> je ladepunkt_hk: max Leistung, DC?, Steckertypen
  const byHk = new Map<string, { max: number; dc: boolean; types: Set<string> }>();
  forEachRow(input.steckerCsv, (get) => {
    const hk = get("ladepunkt_hk");
    if (!hk) return;
    const p = parseGermanNumber(get("max_ladeleistung_stecker")) ?? 0;
    const dc = DC_FLAGS.some((f) => get(f) === "t");
    const cur = byHk.get(hk) ?? { max: 0, dc: false, types: new Set<string>() };
    cur.max = Math.max(cur.max, p);
    cur.dc = cur.dc || dc;
    for (const [flag, label] of TYPE_FLAGS) if (get(flag) === "t") cur.types.add(label);
    byHk.set(hk, cur);
  });

  // 3) Ladepunkte -> Charger (Join)
  const chargers: Charger[] = [];
  const seen = new Set<string>();
  forEachRow(input.ladepunktCsv, (get) => {
    const evseId = get("ladepunkt_id");
    if (!evseId || seen.has(evseId)) return;
    const station = stationById.get(get("ladestation_id"));
    if (!station) return; // ohne Koordinaten kein Ladepunkt
    seen.add(evseId);

    const agg = byHk.get(get("ladepunkt_hk"));
    const connector: Connector = agg?.dc ? "dc" : "ac";
    const powerKw =
      (agg && agg.max > 0 ? agg.max : parseGermanNumber(get("ladepunkt_nennleistung"))) ??
      undefined;

    const charger: Partial<Charger> = {
      evseId,
      name: station.operator
        ? `${station.operator} ${station.ort}`.trim()
        : `Ladepunkt ${station.ort}`.trim(),
      lat: station.lat,
      lng: station.lng,
      operator: station.operator,
      powerKw: powerKw ?? undefined,
      connector,
      connectorType: agg && agg.types.size ? [...agg.types].join(", ") : undefined,
      address: station.address,
      source: "bnetza-api",
      status: station.status,
    };
    if (isValidCharger(charger)) chargers.push(charger);
  });

  return chargers;
}
