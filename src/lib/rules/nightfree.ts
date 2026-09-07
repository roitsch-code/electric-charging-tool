import type { OsmTags } from "./overpass";

/**
 * "Darf ich hier über Nacht stehen?" — abgeleitet aus OSM-Tags (maxstay,
 * maxstay:conditional, opening_hours). Deutsche Parkdauer-Limits an Ladesäulen
 * sind fast immer auf Tageszeiten begrenzt -> nachts meist frei. Verbindlich
 * bleibt das Schild; wir markieren die Quelle ehrlich.
 */
export type NightVerdict = "free" | "limited" | "closed" | "unknown";

export interface NightRule {
  verdict: NightVerdict;
  label: string;
}

/** Nacht-Referenzzeiten (Minuten seit 00:00): 23:00 und 05:00. */
const NIGHT_PROBES = [23 * 60, 5 * 60];

export function resolveNightRule(tags: OsmTags | null): NightRule {
  if (!tags) return { verdict: "unknown", label: "Standzeit unbekannt — Schild prüfen" };

  const cond = tags["maxstay:conditional"];
  const max = tags["maxstay"];
  const oh = tags["opening_hours"];

  // 1) Säule nachts abgeschaltet? (z. B. Supermarkt-Öffnungszeiten)
  if (oh && oh.trim() !== "24/7") {
    const w = parseWindow(oh);
    if (w && !inWindow(w, NIGHT_PROBES[0]!) && !inWindow(w, NIGHT_PROBES[1]!)) {
      return { verdict: "closed", label: `Säule nachts geschlossen (${humanWindow(oh)})` };
    }
  }

  // 2) Zeitfenster-begrenztes Limit -> nachts frei, wenn Fenster nur tagsüber gilt.
  if (cond) {
    const { dur, window } = splitConditional(cond);
    const w = window ? parseWindow(window) : null;
    if (w && !inWindow(w, NIGHT_PROBES[0]!) && !inWindow(w, NIGHT_PROBES[1]!)) {
      return {
        verdict: "free",
        label: `Nachts frei — Limit nur ${humanWindow(window!)}${dur ? ` (${humanDur(dur)})` : ""}`,
      };
    }
    return {
      verdict: "limited",
      label: `Standzeit begrenzt${dur ? ` auf ${humanDur(dur)}` : ""}${window ? ` (${humanWindow(window)})` : ""}`,
    };
  }

  // 3) Durchgehendes Limit ohne Zeitfenster -> auch nachts begrenzt.
  if (max && !["unlimited", "no", "none", "0"].includes(max.trim().toLowerCase())) {
    return { verdict: "limited", label: `Max ${humanDur(max)} — auch nachts` };
  }

  // 4) Keine Begrenzung getaggt -> rechtlich nachts i.d.R. frei.
  return { verdict: "unknown", label: "Keine Begrenzung bekannt — nachts i. d. R. frei" };
}

/** "1 hour @ (Mo-Fr 09:00-18:00)" -> { dur:"1 hour", window:"Mo-Fr 09:00-18:00" } */
function splitConditional(v: string): { dur: string | null; window: string | null } {
  const m = v.split("@");
  const dur = (m[0] ?? "").trim() || null;
  const win = (m[1] ?? "").trim().replace(/^\(|\)$/g, "").trim() || null;
  return { dur, window: win };
}

interface Window { start: number; end: number }

/** Extrahiert HH:MM-HH:MM (Minuten). null, wenn nicht erkennbar. */
function parseWindow(v: string): Window | null {
  const m = v.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  return { start, end };
}

/** Liegt `minute` im Fenster? Behandelt über-Mitternacht (end < start). */
function inWindow(w: Window, minute: number): boolean {
  if (w.end >= w.start) return minute >= w.start && minute < w.end;
  return minute >= w.start || minute < w.end; // wrap über Mitternacht
}

/** "Mo-Fr 09:00-18:00" -> "Mo–Fr 9–18 Uhr" */
function humanWindow(v: string): string {
  return v
    .replace(/:00/g, "")
    .replace(/\b0(\d)/g, "$1")
    .replace(/-/g, "–")
    .replace(/(\d)–(\d)/g, "$1–$2")
    .replace(/\s+/g, " ")
    .trim()
    .concat(" Uhr")
    .replace(/–\s*Uhr/, " Uhr");
}

/** "3 hours" -> "3 h", "1 hour" -> "1 h" */
function humanDur(v: string): string {
  const m = v.match(/([\d.,]+)\s*(hour|hours|std|h|min|minute|minutes)?/i);
  if (!m) return v;
  const n = m[1];
  const unit = (m[2] ?? "").toLowerCase();
  if (unit.startsWith("min")) return `${n} min`;
  return `${n} h`;
}
