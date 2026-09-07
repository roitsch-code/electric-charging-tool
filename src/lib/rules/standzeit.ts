/**
 * Kommunales Standzeit-/Parkregel-Regelwerk (recherchiert, mit Quellen).
 *
 * Es gibt KEINE saubere DE-weite Datenquelle für die Höchstparkdauer an
 * Ladesäulen — die Regel steht auf dem Schild und wird je Kommune festgelegt
 * (StVO Zeichen 314 + Zusatzschild). Darum: pro Stadt recherchiert und hier
 * hinterlegt. Erweiterbar — einfach weitere Städte ergänzen.
 *
 * Reihenfolge im Resolver:
 *   1. Stadt-Regel (dieses Regelwerk) — sofort, ortsgenau für erfasste Städte
 *   2. OSM-Overpass maxstay:conditional (echte Schilddaten) — Client-Fallback
 *   3. ehrlich „unbekannt — Schild vor Ort"
 */

export type StandzeitVerdict = "free" | "limited" | "closed" | "unknown";
export interface StandzeitRule {
  label: string;
  verdict: StandzeitVerdict;
}

type Kind = "ac" | "dc";

/** Städtename für den Schlüssel normalisieren (Umlaute, Kleinschreibung). */
function normCity(city: string): string {
  return city
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z]/g, "")
    .trim();
}

/**
 * Regelwerk je Stadt. Jede Regel gibt für AC/DC ein Label + Verdikt zurück.
 * verdict "free" = über Nacht unproblematisch (grün); "limited" = echte
 * Begrenzung auch relevant (amber). Quellen jeweils im Kommentar.
 */
const CITY_RULES: Record<string, (c: Kind) => StandzeitRule> = {
  // Düsseldorf (SWD/Stadt): Zeichen 314, tags 1 Std (DC) / 4 Std (AC),
  // nachts frei (SWD-Blockiergebühr entfällt 21–08). Quelle: swd-ag.de, electrive.
  duesseldorf: (c) =>
    c === "dc"
      ? { label: "Nachts frei · tagsüber max. 1 Std", verdict: "free" }
      : { label: "Nachts frei · tagsüber max. 4 Std", verdict: "free" },

  // Hamburg: nur während des Ladens; werktags 9–20 Uhr max. 3 Std (AC) /
  // 1 Std (DC), außerhalb ohne Zeitlimit. Quelle: hamburg.de, polizei.hamburg.
  hamburg: (c) =>
    c === "dc"
      ? { label: "Tags 9–20 Uhr max. 1 Std · nachts ohne Limit", verdict: "free" }
      : { label: "Tags 9–20 Uhr max. 3 Std · nachts ohne Limit", verdict: "free" },

  // Köln (Stadt/SWK): max. 4 Std; Blockiergebühr nur 9–21 Uhr → nachts frei.
  // Quelle: stadt-koeln.de.
  koeln: (c) =>
    c === "dc"
      ? { label: "Nachts frei · tagsüber 9–21 Uhr max. 1 Std", verdict: "free" }
      : { label: "Nachts frei · tagsüber 9–21 Uhr max. 4 Std", verdict: "free" },
};

/** Stadt-Regel nachschlagen (null, wenn Stadt nicht im Regelwerk). */
export function cityStandzeit(city: string | undefined, connector: Kind): StandzeitRule | null {
  if (!city) return null;
  const fn = CITY_RULES[normCity(city)];
  return fn ? fn(connector) : null;
}

/** Ob eine Stadt im Regelwerk erfasst ist (für ehrliche Fallback-Meldung). */
export function hasCityRule(city: string | undefined): boolean {
  return !!city && normCity(city) in CITY_RULES;
}

/** Stadt aus TomTom-Adresse ableiten: municipality bevorzugt, sonst aus dem
 *  Freitext ("…, 40235 Düsseldorf" -> "Düsseldorf"). */
export function cityFromAddress(freeformAddress?: string, municipality?: string): string | undefined {
  // Poststadt aus dem Freitext bevorzugen ("…, 50825 Köln" -> "Köln"):
  // TomToms `municipality` ist teils ein Stadtteil (z. B. "Ehrenfeld").
  if (freeformAddress) {
    const last = freeformAddress.split(",").pop()?.trim() ?? "";
    const city = last.replace(/^\d{4,5}\s*/, "").trim();
    if (city) return city;
  }
  return municipality || undefined;
}
