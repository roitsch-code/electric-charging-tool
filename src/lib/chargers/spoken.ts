import type { PlanInput, PlanResult, RankedCharger } from "./types";

/**
 * Sprechtext fuer die vorgelesene Push-Mitteilung (Konzept §6.6).
 *
 * Regeln aus dem Konzept:
 *  - keine Abkuerzungen, keine EVSE-IDs, keine Betreibernamen
 *  - Einheiten ausgeschrieben ("Kilowatt", nicht "kW")
 *  - Gehdistanz IN den Text (nicht erst hinter den Link)
 *  - maximal ein Satz plus Bewertung
 *  - kleine Zahlen ausgeschrieben, wo Siri sonst stolpert
 *
 * Leistungsangabe ist die vom FAHRZEUG nutzbare Leistung, nicht die
 * Typenschild-Leistung der Saeule — das ist die ehrliche, relevante Zahl.
 */

const ZERO_TO_TWELVE = [
  "null",
  "einer",
  "zwei",
  "drei",
  "vier",
  "fünf",
  "sechs",
  "sieben",
  "acht",
  "neun",
  "zehn",
  "elf",
  "zwölf",
];

function spellCount(n: number): string {
  return n >= 0 && n < ZERO_TO_TWELVE.length ? ZERO_TO_TWELVE[n]! : String(n);
}

/** Namen kurz halten: alles ab dem ersten Komma (Stadt/Adresse) weg. */
function shortName(name: string | undefined): string {
  if (!name) return "Ziel";
  const head = name.split(",")[0]!.trim();
  return head || "Ziel";
}

function distancePhrase(top: RankedCharger, destName: string): string {
  if (top.charger.atDestination) return `direkt am ${destName}`;
  const m = top.walkingM;
  if (m < 1000) {
    const rounded = Math.round(m / 10) * 10;
    return `${rounded} Meter vom ${destName}`;
  }
  const km = (m / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 });
  return `${km} Kilometer vom ${destName}`;
}

function availabilityPhrase(result: PlanResult): string {
  const known = result.top.filter(
    (r) => r.charger.status && r.charger.status !== "unknown",
  );
  if (known.length === 0 && result.candidateCount > 0) {
    return "Belegung unbekannt";
  }
  const free = result.top.filter((r) => r.charger.status === "available").length;
  const total = result.top.length;
  if (total === 1) {
    return free === 1 ? "der einzige Punkt ist frei" : "der einzige Punkt ist belegt";
  }
  return `${spellCount(free)} von ${spellCount(total)} Punkten frei`;
}

function assessment(top: RankedCharger, input: PlanInput): string {
  const isDc = top.charger.connector === "dc";
  const demandDc = input.dwellMinutes !== null && input.dwellMinutes < 60;
  const longReturn = (input.returnTripKm ?? 0) > 150;

  if ((demandDc || longReturn) && !isDc) {
    return "Nur langsame Wechselstrom-Ladung, für den kurzen Halt zu wenig.";
  }
  if (longReturn && isDc) return "Schnelllader, reicht für die Rückfahrt.";
  if (demandDc && isDc) return "Schnelllader, passt für den kurzen Halt.";
  if (input.dwellMinutes !== null && input.dwellMinutes > 360) {
    return "Reicht über Nacht.";
  }
  return "Reicht für ein paar Stunden.";
}

/**
 * Baut den Sprechsatz fuer den Ladepunkt an Position `index` der Top-Liste
 * (0 = Empfehlung, 1 = "Alternative"). Gibt null zurueck, wenn es dort
 * keinen Punkt gibt.
 */
export function spokenForPlan(
  result: PlanResult,
  input: PlanInput,
  index = 0,
): string | null {
  const top = result.top[index];
  if (!top) {
    return "Ladeplanner: kein Ladepunkt in Gehdistanz gefunden.";
  }
  const destName = shortName(result.destination.name);
  const dist = distancePhrase(top, destName);
  const avail = availabilityPhrase(result);
  const power = `${Math.round(top.usablePowerKw)} Kilowatt`;
  const verdict = assessment(top, input);

  const expandedNote = result.expanded
    ? ` Nächster Punkt erst im erweiterten Umkreis von ${Math.round(
        result.usedRadiusM / 1000,
      )} Kilometern.`
    : "";

  return `Ladeplanner: ${dist}, ${avail}, ${power}. ${verdict}${expandedNote}`;
}
