/**
 * Stufe 2 (Parsing): Ortsnamen aus einer aufgeloesten Google-Maps-URL
 * ziehen, damit ihn Stufe 2 (Geocoding) verwenden kann (Konzept §4).
 *
 * Namen stecken je nach URL-Typ an verschiedenen Stellen:
 *   - Pfadsegment nach `/place/`  (Standardfall)
 *   - Query `q=` / `query=` / `destination=` (nicht als lat,lng)
 *
 * Der Name in `/place/` ist `+`-getrennt und prozent-kodiert:
 *   "/place/Gastwerk+Hotel+Hamburg/@..." -> "Gastwerk Hotel Hamburg"
 */

const PLACE_SEGMENT = /\/place\/([^/@?#]+)/;

function decodePlus(segment: string): string {
  // Google trennt Wortteile mit '+'. decodeURIComponent laesst '+' stehen,
  // deshalb zuerst ersetzen, dann dekodieren.
  const withSpaces = segment.replace(/\+/g, " ");
  try {
    return decodeURIComponent(withSpaces).trim();
  } catch {
    // Kaputte Prozent-Sequenz: unverfaelscht zurueckgeben statt zu werfen.
    return withSpaces.trim();
  }
}

/** Sieht der Kandidat wie ein reines Koordinatenpaar aus? Dann kein Name. */
const LOOKS_LIKE_COORDS = /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/;

export function extractPlaceName(resolvedUrl: string): string | null {
  const place = PLACE_SEGMENT.exec(resolvedUrl);
  if (place && place[1]) {
    const name = decodePlus(place[1]);
    if (name && !LOOKS_LIKE_COORDS.test(name)) return name;
  }

  let params: URLSearchParams | null = null;
  try {
    params = new URL(resolvedUrl).searchParams;
  } catch {
    params = null;
  }
  if (params) {
    for (const key of ["q", "query", "destination", "daddr"]) {
      const value = params.get(key);
      if (!value) continue;
      const trimmed = value.trim();
      if (trimmed && !LOOKS_LIKE_COORDS.test(trimmed)) return trimmed;
    }
  }

  return null;
}
