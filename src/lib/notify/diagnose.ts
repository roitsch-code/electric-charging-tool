import type { Beat } from "./beat";
import type { Transport } from "./send";

/**
 * Klartext-Befund zur Push-Kette.
 *
 * Der Anlass: Eine Fahrt ohne Push ist von außen mehrdeutig — die Säule war
 * frei (dann ist Schweigen richtig), der Cron lief nicht, der Versandweg fehlt,
 * oder die Säule wurde bei der Nachprüfung nicht wiedergefunden. Alle vier
 * Fälle sehen gleich aus. Diese Funktion macht aus den Rohdaten Sätze, die die
 * Frage beantworten, und ist bewusst rein (kein DB-, kein Netzzugriff).
 */

export interface DiagWatch {
  tripId: string;
  name: string;
  watchFrom: Date;
  watchUntil: Date;
  checks: number;
  checkedAt: Date | null;
  startPushAt: Date | null;
  diversions: number;
  lastReason: string | null;
  lastError: string | null;
  doneAt: Date | null;
  doneReason: string | null;
}

export interface DiagInput {
  now: Date;
  transport: Transport | null;
  beats: Beat[];
  /** Jüngste Überwachungen, neueste zuerst. */
  watches: DiagWatch[];
}

/** "vor 41 Sekunden" / "vor 3 Minuten" / "vor 2 Stunden" / "vor 4 Tagen". */
export function seit(from: Date, now: Date): string {
  const s = Math.max(0, Math.round((now.getTime() - from.getTime()) / 1000));
  if (s < 90) return `vor ${s} Sekunden`;
  const min = Math.round(s / 60);
  if (min < 90) return `vor ${min} Minuten`;
  const h = Math.round(min / 60);
  if (h < 36) return `vor ${h} Stunden`;
  return `vor ${Math.round(h / 24)} Tagen`;
}

function uhr(d: Date): string {
  return d.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
}

/** Warum ein Tick nicht gepusht hat — in Worten statt als Schlüsselwort. */
function reasonText(reason: string | null): string {
  switch (reason) {
    case "still-free":
      return "Säule war bei jeder Prüfung frei";
    case "unknown":
      return "keine Live-Belegung für diese Säule (Zustand unbekannt)";
    case "gone":
      return "Säule wurde bei der Nachprüfung nicht wiedergefunden";
    case "already-pushed":
      return "es war bereits umgeleitet worden";
    case "send-failed":
      return "der Versand ist fehlgeschlagen";
    case "became-occupied":
    case "occupied":
      return "Säule war belegt";
    default:
      return "kein Grund vermerkt";
  }
}

/**
 * Der Befund: eine Liste kurzer Sätze, wichtigstes zuerst. Leere Liste gibt es
 * nicht — im Zweifel steht dort, dass alles in Ordnung aussieht.
 */
export function befund(input: DiagInput): string[] {
  const out: string[] = [];
  const { now, transport, beats, watches } = input;

  // 1. Versandweg — ohne den geht gar nichts.
  if (!transport) {
    out.push(
      "FEHLER: Kein Versandweg eingerichtet. TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID " +
        "(oder NTFY_TOPIC) fehlen im Container. Ohne die geht kein einziger Push raus.",
    );
  } else {
    out.push(`Versandweg: ${transport === "telegram" ? "Telegram" : "ntfy"}.`);
  }

  // 2. Cron — feuert er überhaupt?
  const dispatch = beats.find((b) => b.job === "dispatch");
  if (!dispatch) {
    out.push(
      "FEHLER: Der Minuten-Cron hat sich noch nie gemeldet. Entweder läuft ofelia nicht, " +
        "oder der Aufruf erreicht die App nicht (docker logs ladeplanner-ofelia).",
    );
  } else {
    const alterMin = (now.getTime() - dispatch.lastRunAt.getTime()) / 60_000;
    if (dispatch.lastDeniedAt && dispatch.lastDeniedAt > dispatch.lastRunAt) {
      out.push(
        `FEHLER: Cron-Aufrufe werden abgewiesen (401, zuletzt ${seit(dispatch.lastDeniedAt, now)}). ` +
          "CRON_SECRET im Container und im Cron-Aufruf stimmen nicht überein.",
      );
    } else if (alterMin > 5) {
      out.push(
        `FEHLER: Der Minuten-Cron hat zuletzt ${seit(dispatch.lastRunAt, now)} gelaufen — er feuert nicht mehr.`,
      );
    } else {
      out.push(`Cron läuft (letzter Lauf ${seit(dispatch.lastRunAt, now)}, ${dispatch.runs} Läufe).`);
    }
    if (!dispatch.ok && dispatch.detail) {
      out.push(`Letzter Cron-Lauf meldete: ${dispatch.detail}`);
    }
  }

  // 3. Die jüngste Überwachung — der eigentliche Fall.
  const w = watches[0];
  if (!w) {
    out.push(
      "Es ist noch nie eine Säule zur Überwachung angemeldet worden. " +
        "Der „Losfahren\"-Knopf schickt dann kein `target` mit — oder die Fahrt ist älter als dieser Stand.",
    );
    return out;
  }

  const fenster = `${uhr(w.watchFrom)}–${uhr(w.watchUntil)} Uhr`;
  if (w.checks === 0) {
    out.push(
      `FEHLER: „${w.name}\" (Fenster ${fenster}) wurde KEIN einziges Mal geprüft. ` +
        (w.watchUntil < now
          ? "Das Fenster ist vorbei — in dieser Zeit hat der Cron nicht gelaufen."
          : "Das Fenster läuft noch."),
    );
    return out;
  }

  out.push(
    `„${w.name}\": ${w.checks} Prüfungen im Fenster ${fenster}` +
      (w.checkedAt ? `, zuletzt ${seit(w.checkedAt, now)}` : "") +
      `. Letzter Befund: ${reasonText(w.lastReason)}.`,
  );

  if (w.lastError) out.push(`Fehler bei der Abfrage: ${w.lastError}`);

  if (w.diversions > 0) {
    out.push("Ein Ausweich-Push ist rausgegangen (Säule war belegt).");
  } else if (w.startPushAt) {
    out.push(
      `Ankunfts-Push ist um ${uhr(w.startPushAt)} Uhr rausgegangen. ` +
        "Kam er nicht an, liegt es am Zustellweg (Telegram/iOS), nicht an der App.",
    );
  } else if (w.lastReason === "still-free") {
    out.push(
      "Kein Push — die Säule blieb frei. Bis zum Stand mit dem Ankunfts-Push war " +
        "das gewolltes Verhalten; seitdem geht 15 min vor Ankunft immer einer raus.",
    );
  } else if (w.lastReason === "unknown" || w.lastReason === "gone") {
    out.push(
      "Kein Push, weil der Zustand nicht belastbar war — es wird nichts behauptet, " +
        "was nicht in den Daten steht (CLAUDE.md, „nichts halluzinieren\").",
    );
  }

  return out;
}
