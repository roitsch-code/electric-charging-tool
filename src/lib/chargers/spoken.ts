import { cityStandzeit, spokenStandzeit } from "@/lib/rules/standzeit";
import type { Charger, ChargerStatus, PlanInput, PlanResult, RankedCharger } from "./types";

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

/** Belegungs-Satz fuer EINEN Ladepunkt (nicht die ganze Top-Liste). */
function chargerAvailabilityPhrase(c: Charger): string {
  if (c.status === "outoforder") return "außer Betrieb";
  if (!c.status || c.status === "unknown") return "Belegung unbekannt";
  if (typeof c.freePoints === "number" && typeof c.totalPoints === "number" && c.totalPoints > 0) {
    if (c.totalPoints === 1) return c.freePoints > 0 ? "frei" : "belegt";
    return `${spellCount(c.freePoints)} von ${spellCount(c.totalPoints)} Punkten frei`;
  }
  return c.status === "available" ? "frei" : "belegt";
}

/** Kurzer, sprechbarer Name einer Saeule (bis zum ersten Komma). */
export function spokenChargerName(name: string | undefined): string {
  if (!name) return "Die Ladesäule";
  const head = name.split(",")[0]!.trim();
  return head || "Die Ladesäule";
}

/** Was mit der angefahrenen Saeule los ist — knapp und korrekt. */
function targetProblem(status: ChargerStatus | undefined): string {
  return status === "outoforder" ? "ist außer Betrieb" : "ist belegt";
}

/**
 * Gehdistanz der Alternative, kurz. Der Zielname steht schon im Kontext und
 * wird deshalb NICHT wiederholt ("550 Meter zum Ziel", nicht "550 Meter vom
 * Gastwerk Hotel Hamburg") — jedes Wort zaehlt beim Vorlesen.
 */
function walkPhrase(top: RankedCharger): string {
  if (top.charger.atDestination) return "direkt am Ziel";
  const m = top.walkingM;
  if (m < 1000) return `${Math.round(m / 10) * 10} Meter zum Ziel`;
  const km = (m / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 });
  return `${km} Kilometer zum Ziel`;
}

/**
 * Warnung, wenn die Alternative NICHT zum Bedarf passt. Eine passende
 * Alternative bekommt bewusst keinen Zusatz: "Reicht über Nacht" ist im
 * Ausweich-Push Ballast — die Aufenthaltsdauer hat der Fahrer selbst gewaehlt.
 */
function mismatchWarning(top: RankedCharger, input: PlanInput): string | null {
  if (top.charger.connector === "dc") return null;
  if (input.dwellMinutes !== null && input.dwellMinutes < 60) {
    return "Nur Wechselstrom, für den kurzen Halt zu wenig.";
  }
  if ((input.returnTripKm ?? 0) > 150) {
    return "Nur Wechselstrom, für die Rückfahrt zu wenig.";
  }
  return null;
}

/**
 * Standzeit-Satz fuer einen Ladepunkt zur ANKUNFTSZEIT ("Kannst dort die Nacht
 * ueber stehen."). Das ist die Kernfrage des Projekts. Leer, wenn fuer die
 * Stadt keine strukturierte Regel vorliegt — dann wird nichts erfunden.
 */
export function standzeitSentence(charger: Charger, at: Date): string | null {
  const kind: "ac" | "dc" = charger.connector === "dc" ? "dc" : "ac";
  return spokenStandzeit(cityStandzeit(charger.city, kind), at);
}

/**
 * Sprechsatz fuer den Ausweich-Push (Notification-Pusher).
 *
 * Wird im Auto vorgelesen, waehrend gefahren wird — deshalb so knapp wie
 * moeglich und in der Reihenfolge, in der man es braucht: was ist los, wohin
 * stattdessen, wie weit zu Fuss, ist dort frei, wie schnell. Die Alternative
 * wird NAMENTLICH genannt; ohne Namen weiss man nicht, wohin man faehrt, und
 * Antippen ist waehrend der Fahrt keine Option (§ 23 Abs. 1a StVO, §6.6).
 */
export function spokenDiversion(
  target: { name: string; status?: ChargerStatus },
  alternative: RankedCharger | null,
  input: PlanInput,
  at: Date = new Date(),
): string {
  const head = `Ladeplanner: ${spokenChargerName(target.name)} ${targetProblem(target.status)}.`;
  // Ohne Alternative endet die Ansage nicht in der Sackgasse, sondern sagt,
  // was jetzt zu tun ist: einfach ans Ziel fahren (Knopf dazu in message.ts).
  if (!alternative) {
    return `${head} Keine freie Alternative in Gehdistanz. Navigation stattdessen zum Ziel.`;
  }

  const parts = [
    `Ausweichen auf ${spokenChargerName(alternative.charger.name)}`,
    walkPhrase(alternative),
    chargerAvailabilityPhrase(alternative.charger),
    `${Math.round(alternative.usablePowerKw)} Kilowatt`,
  ];
  const warn = mismatchWarning(alternative, input);
  const stand = standzeitSentence(alternative.charger, at);
  return `${head} ${parts.join(", ")}.${warn ? ` ${warn}` : ""}${stand ? ` ${stand}` : ""}`;
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
  at: Date = new Date(),
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

  const stand = standzeitSentence(top.charger, at);
  return `Ladeplanner: ${dist}, ${avail}, ${power}. ${verdict}${stand ? ` ${stand}` : ""}${expandedNote}`;
}
