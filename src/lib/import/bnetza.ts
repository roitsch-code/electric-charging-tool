import type { Charger } from "../chargers/types";
import {
  deriveConnector,
  isValidCharger,
  looksLikeGermanCoords,
  parseGermanNumber,
  stableHash,
} from "./normalize";

/**
 * Parser fuer das BNetzA-Ladesaeulenregister (Konzept §5.1).
 *
 * Reales Format: CSV, semikolon-getrennt, deutsche Dezimalkommas, mehrere
 * Vorspann-Zeilen vor der eigentlichen Kopfzeile, gelegentlich Anfuehrungs-
 * zeichen. Deshalb tolerant: Kopfzeile wird per Inhalt gefunden, Spalten per
 * Name (nicht per Index) gemappt. Aendert die BNetzA die Spaltenreihenfolge,
 * bricht das hier nicht.
 *
 * Download (manuell, da undokumentiert/gross):
 * https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/Ladesaeulenkarte/start.html
 * -> CSV/Excel exportieren, als .csv speichern, dann `npm run import:bnetza -- <pfad>`.
 */

const DELIM = ";";

/** CSV-Zeile splitten, Anfuehrungszeichen respektieren. */
export function splitCsvLine(line: string, delim = DELIM): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delim && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function normalizeKey(k: string): string {
  return k
    .toLowerCase()
    .replace(/\[.*?\]/g, "")
    .replace(/[^a-zäöüß0-9]/g, "")
    .trim();
}

/** Findet den Wert zu einem von mehreren moeglichen Spaltennamen. */
function pick(
  row: string[],
  headerIndex: Map<string, number>,
  candidates: string[],
): string | undefined {
  for (const c of candidates) {
    const idx = headerIndex.get(normalizeKey(c));
    if (idx !== undefined && row[idx] !== undefined && row[idx] !== "") {
      return row[idx];
    }
  }
  return undefined;
}

export function parseBnetzaCsv(text: string): Charger[] {
  // BOM entfernen, Zeilen splitten (CRLF/LF).
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);

  // Kopfzeile finden: enthaelt Breitengrad UND Laengengrad.
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!.toLowerCase();
    if (l.includes("breitengrad") && l.includes("ngengrad")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const header = splitCsvLine(lines[headerIdx]!);
  const headerIndex = new Map<string, number>();
  header.forEach((h, i) => headerIndex.set(normalizeKey(h), i));

  const chargers: Charger[] = [];
  const seen = new Set<string>();

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i]!;
    if (raw.trim() === "") continue;
    const row = splitCsvLine(raw);

    const lat = parseGermanNumber(pick(row, headerIndex, ["Breitengrad"]));
    const lng = parseGermanNumber(pick(row, headerIndex, ["Längengrad", "Laengengrad"]));
    if (lat === null || lng === null || !looksLikeGermanCoords(lat, lng)) continue;

    const operator = pick(row, headerIndex, ["Betreiber"]);
    const street = pick(row, headerIndex, ["Straße", "Strasse"]) ?? "";
    const houseNo = pick(row, headerIndex, ["Hausnummer"]) ?? "";
    const plz = pick(row, headerIndex, ["Postleitzahl", "PLZ"]) ?? "";
    const ort = pick(row, headerIndex, ["Ort"]) ?? "";
    const bauart = pick(row, headerIndex, [
      "Art der Ladeeinrichtung",
      "Art der Ladeeinrichung",
    ]);
    const connectorType = pick(row, headerIndex, [
      "Steckertypen1",
      "Steckertypen",
      "Steckertyp",
    ]);
    const powerKw =
      parseGermanNumber(
        pick(row, headerIndex, [
          "Nennleistung Ladeeinrichtung",
          "Anschlussleistung",
          "Nennleistung",
        ]),
      ) ?? null;

    const connector = deriveConnector({ bauart, connectorType, powerKw });
    const address = [
      [street, houseNo].filter(Boolean).join(" "),
      [plz, ort].filter(Boolean).join(" "),
    ]
      .filter(Boolean)
      .join(", ");

    const idSeed = [operator, street, houseNo, plz, ort, lat, lng].join("|");
    const evseId = `DE*BNA*${stableHash(idSeed)}`;
    if (seen.has(evseId)) continue;
    seen.add(evseId);

    const charger: Partial<Charger> = {
      evseId,
      name: operator ? `${operator} ${ort}`.trim() : `Ladepunkt ${ort}`.trim(),
      lat,
      lng,
      operator: operator || undefined,
      powerKw: powerKw ?? undefined,
      connector,
      connectorType: connectorType || undefined,
      address: address || undefined,
      source: "bnetza",
      // BNetzA liefert keine Realtime-Verfuegbarkeit -> unknown.
      status: "unknown",
    };

    if (isValidCharger(charger)) chargers.push(charger);
  }

  return chargers;
}
