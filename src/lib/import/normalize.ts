import type { Charger, ChargerStatus } from "../chargers/types";
import type { Connector } from "../vehicle";

/**
 * Gemeinsame Normalisierungshelfer fuer die Importer (BNetzA, OCM).
 * Bewusst ohne `@/`-Alias, damit die Importskripte per tsx ohne
 * zusaetzliche Pfadaufloesung laufen.
 */

/** Deutsche Dezimalzahl ("53,5503" / "150,00") -> number | null. */
export function parseGermanNumber(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const cleaned = String(raw).trim().replace(/\s/g, "").replace(",", ".");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Leitet AC/DC ab. Reihenfolge der Signale: explizite Bauart -> Steckertyp
 * -> Leistung. AFIR-Definition: Schnellladeeinrichtung = > 22 kW.
 */
export function deriveConnector(opts: {
  bauart?: string;
  connectorType?: string;
  powerKw?: number | null;
}): Connector {
  const bauart = (opts.bauart ?? "").toLowerCase();
  if (bauart.includes("schnell")) return "dc";
  if (bauart.includes("normal")) {
    // Normalladeeinrichtung ist per Definition AC, unabhaengig vom Rest.
    return "ac";
  }
  const ct = (opts.connectorType ?? "").toLowerCase();
  if (/(ccs|combo|chademo|\bdc\b|gleichstrom)/.test(ct)) return "dc";
  if ((opts.powerKw ?? 0) > 22) return "dc";
  return "ac";
}

/** Stabiler, kurzer Hash (djb2) fuer synthetische, importstabile IDs. */
export function stableHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  // in vorzeichenlosen Hex wandeln
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Koordinaten grob plausibel? (Deutschland-Bounding-Box, grosszuegig.) */
export function looksLikeGermanCoords(lat: number, lng: number): boolean {
  return lat > 46 && lat < 56 && lng > 5 && lng < 16;
}

export function isValidCharger(c: Partial<Charger>): c is Charger {
  return (
    typeof c.evseId === "string" &&
    c.evseId.length > 0 &&
    typeof c.lat === "number" &&
    typeof c.lng === "number" &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lng) &&
    (c.connector === "ac" || c.connector === "dc")
  );
}

export const KNOWN_STATUS: ChargerStatus[] = [
  "available",
  "occupied",
  "outoforder",
  "unknown",
];
