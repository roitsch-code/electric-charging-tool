import type { Coordinates } from "./types";

/**
 * Stufe 1 (Parsing): Koordinaten aus einer bereits aufgeloesten
 * Google-Maps-URL ziehen (Konzept §4, Stufe 1).
 *
 * Google kodiert Koordinaten in mehreren, undokumentierten Formen. Wir
 * probieren sie in absteigender Genauigkeit:
 *
 *   1. `!3d<lat>!4d<lng>`  — der eigentliche POI-Pin im `data=`-Blob.
 *      Praeziser als der Viewport, weil er auf den Ort zeigt, nicht auf
 *      die Kartenmitte.
 *   2. `/@<lat>,<lng>,<zoom>z` — Viewport-Mitte (das im Konzept genannte
 *      Muster). Meist identisch mit dem Pin, gelegentlich leicht versetzt.
 *   3. Query-Parameter `q` / `ll` / `query` / `center` / `destination`
 *      im Format `lat,lng` — kommt bei aelteren und bei API-URLs vor.
 *
 * WARNUNG: Alles hier ist undokumentiertes Google-Verhalten und kann
 * jederzeit brechen. Deshalb ist der manuelle Fallback (Stufe 3) Pflicht.
 */

const LAT = -90;
const LAT_MAX = 90;
const LNG = -180;
const LNG_MAX = 180;

function isValid(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= LAT &&
    lat <= LAT_MAX &&
    lng >= LNG &&
    lng <= LNG_MAX &&
    // 0,0 (Null Island) ist praktisch immer ein Parser-Artefakt, kein Ziel.
    !(lat === 0 && lng === 0)
  );
}

/** `!3d53.5503!4d9.9920` — der POI-Pin. */
const DATA_PIN = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/;

/** `/@53.5503,9.9920,17z` — Viewport-Mitte. */
const AT_VIEWPORT = /\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;

/** `?q=53.5503,9.9920` und Verwandte. */
const QUERY_KEYS = ["q", "ll", "query", "center", "destination", "daddr"];
const LATLNG_PAIR = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

export function extractCoordinates(resolvedUrl: string): Coordinates | null {
  const pin = DATA_PIN.exec(resolvedUrl);
  if (pin) {
    const lat = Number(pin[1]);
    const lng = Number(pin[2]);
    if (isValid(lat, lng)) return { lat, lng };
  }

  const at = AT_VIEWPORT.exec(resolvedUrl);
  if (at) {
    const lat = Number(at[1]);
    const lng = Number(at[2]);
    if (isValid(lat, lng)) return { lat, lng };
  }

  let params: URLSearchParams | null = null;
  try {
    params = new URL(resolvedUrl).searchParams;
  } catch {
    params = null;
  }
  if (params) {
    for (const key of QUERY_KEYS) {
      const value = params.get(key);
      if (!value) continue;
      const m = LATLNG_PAIR.exec(value);
      if (!m) continue;
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (isValid(lat, lng)) return { lat, lng };
    }
  }

  return null;
}
