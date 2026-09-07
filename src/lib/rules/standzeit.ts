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
export function normCity(city: string): string {
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
  // Düsseldorf (SWD/Stadt): Zeichen 314; tagsüber max. 1 Std (DC) / 4 Std (AC),
  // 21–9 Uhr frei (SWD-Blockiergebühr entfällt). Quelle: swd-ag.de, electrive.
  duesseldorf: (c) =>
    c === "dc"
      ? { label: "Max. 1 Std · 21–9 Uhr frei", verdict: "free" }
      : { label: "Max. 4 Std · 21–9 Uhr frei", verdict: "free" },

  // Hamburg: nur während des Ladens; werktags 9–20 Uhr max. 3 Std (AC) /
  // 1 Std (DC), außerhalb ohne Zeitlimit. Quelle: hamburg.de, polizei.hamburg.
  hamburg: (c) =>
    c === "dc"
      ? { label: "Max. 1 Std (9–20 Uhr) · 20–9 Uhr frei", verdict: "free" }
      : { label: "Max. 3 Std (9–20 Uhr) · 20–9 Uhr frei", verdict: "free" },

  // Köln (Stadt/SWK): max. 4 Std; Blockiergebühr nur 9–21 Uhr → 21–9 Uhr frei.
  // Quelle: stadt-koeln.de.
  koeln: (c) =>
    c === "dc"
      ? { label: "Max. 1 Std (9–21 Uhr) · 21–9 Uhr frei", verdict: "free" }
      : { label: "Max. 4 Std (9–21 Uhr) · 21–9 Uhr frei", verdict: "free" },

  // Aachen (Stadt/STAWAG): aktives Laden 7–21 Uhr max. 2 Std (AC) / 1 Std (DC),
  // Parkscheibe + E-Kennzeichen; außerhalb frei. Quelle: aachen.de, stawag.de.
  aachen: (c) =>
    c === "dc"
      ? { label: "Max. 1 Std (7–21 Uhr) · 21–7 Uhr frei", verdict: "free" }
      : { label: "Max. 2 Std (7–21 Uhr) · 21–7 Uhr frei", verdict: "free" },

  // Emmerich am Rhein: keine eigene E-Ladesäulen-Satzung auffindbar. Öffentlich
  // lädt man bei Stadtwerke Emmerich (18 Punkte, bis 22 kW AC; emmerich.de,
  // „E-Mobilität für die Bürgerschaft"). In der bewirtschafteten Innenstadt gilt
  // Parkscheibe, max. 2 Std, Mo–Fr ~9–19 / Sa 9–14 Uhr -> abends/nachts/So frei
  // (emmerich.de, „Parkflächen Innenstadt über 1 Std"). An der Säule zusätzlich
  // StVO Z. 314 „während des Ladevorgangs". Konservativ als Innenstadt-Regel
  // hinterlegt; außerhalb der Zone greift praktisch nur „während des Ladens".
  emmerich: () => ({
    label: "Max. 2 Std mit Parkscheibe (Mo–Sa tags) · abends/nachts frei",
    verdict: "free",
  }),
  // Alias: TomTom liefert die Poststadt teils als „Emmerich am Rhein".
  emmerichamrhein: () => ({
    label: "Max. 2 Std mit Parkscheibe (Mo–Sa tags) · abends/nachts frei",
    verdict: "free",
  }),
};

/** Allgemeiner, ehrlich als solcher gekennzeichneter Hinweis, wenn für die
 *  Stadt (noch) keine recherchierte Regel vorliegt. Kein erfundener Wert. */
export function generalStandzeitNote(): StandzeitRule {
  return { label: "Nur während des Ladens · Höchstparkdauer laut Schild", verdict: "unknown" };
}

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
