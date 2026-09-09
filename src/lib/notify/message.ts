import {
  driveToChargerUrl,
  driveToUrl,
  spokenArrival,
  spokenDiversion,
  spokenForPlan,
  walkFromChargerUrl,
  type PlanInput,
  type PlanResult,
  type RankedCharger,
} from "@/lib/chargers";
import { haversineMeters } from "@/lib/chargers/geo";
import type { Charger, ChargerStatus } from "@/lib/chargers/types";
import type { Coordinates } from "@/lib/resolver/types";
import type { NtfyMessage } from "./ntfy";
import { SAME_CHARGER_M } from "./watch";

/**
 * Baut die Push-Nachricht aus einem Plan (Konzept §6.6/§6.7):
 * vorzulesender Satz als Body, Deeplinks als Action-Buttons.
 */
export function buildPushMessage(
  topic: string,
  plan: PlanResult,
  input: PlanInput,
  destination: Coordinates,
): NtfyMessage {
  const message = spokenForPlan(plan, input, 0) ?? "Ladeplanner: kein Ergebnis.";
  const top = plan.top[0];

  const actions: NtfyMessage["actions"] = [];
  if (top) {
    actions.push({
      action: "view",
      label: "Hinfahren",
      url: driveToChargerUrl(top.charger),
    });
    actions.push({
      action: "view",
      label: "Zum Ziel",
      url: walkFromChargerUrl(top.charger, destination),
    });
  }

  return {
    topic,
    title: "Ladeplanner",
    message,
    tags: ["battery"],
    priority: 4,
    actions,
  };
}

/**
 * Beste Alternative zur überwachten Säule: dieselbe Rangliste, aber ohne den
 * Punkt, der gerade belegt ist — und ohne Punkte, die nachweislich voll oder
 * defekt sind. Ist gar nichts nachweislich frei, wird der bestplatzierte Rest
 * genommen (Status "unbekannt" ist kein Ausschlussgrund, nur "0 frei"/defekt).
 */
export function pickAlternative(
  plan: PlanResult,
  exclude: { evseId: string; lat: number; lng: number },
): RankedCharger | null {
  const others = plan.top.filter((r) => {
    if (r.charger.evseId === exclude.evseId) return false;
    return haversineMeters(r.charger, exclude) > SAME_CHARGER_M;
  });
  if (others.length === 0) return null;
  const usable = others.filter((r) => {
    const c = r.charger;
    if (c.status === "outoforder") return false;
    if (typeof c.freePoints === "number") return c.freePoints > 0;
    return c.status !== "occupied";
  });
  return usable[0] ?? others[0]!;
}

/**
 * Push 15 Minuten vor Ankunft, wenn mit der überwachten Säule alles in
 * Ordnung ist (oder keine Live-Daten vorliegen). Geht EINMAL pro Fahrt raus.
 *
 * Der Grund, warum es ihn gibt: Ohne ihn schweigt die App bei freier Säule
 * komplett — und Schweigen ist unterwegs nicht von "Überwachung läuft gar
 * nicht" zu unterscheiden. Ein Satz beseitigt die Unsicherheit und ist
 * zugleich der Beweis, dass die Kette funktioniert.
 */
export function buildArrivalMessage(
  topic: string,
  charger: Charger | null,
  target: { name: string; lat: number; lng: number },
  destination: Coordinates & { name?: string },
  /** Ankunftszeit — entscheidet, ob "drei Stunden" oder "die Nacht über". */
  at: Date = new Date(),
): NtfyMessage {
  const at2 = { lat: charger?.lat ?? target.lat, lng: charger?.lng ?? target.lng };
  return {
    topic,
    title: "Ladeplanner",
    message: spokenArrival(charger, target.name, at),
    tags: ["battery"],
    // Niedriger als der Ausweich-Push: hier ist nichts zu tun, es ist eine
    // Bestätigung. Vorgelesen wird sie trotzdem (Telegram = Direktnachricht).
    priority: 4,
    actions: [
      { action: "view", label: "Hinfahren", url: driveToUrl(at2) },
      { action: "view", label: "Zum Ziel", url: walkFromChargerUrl(at2, destination) },
    ],
  };
}

/**
 * Push, wenn die angefahrene Säule ausfällt (Notification-Pusher).
 * Sprechsatz nach §6.6 (siehe spokenDiversion) — Deeplinks als Buttons für
 * den Fall, dass das Auto steht und Tippen erlaubt ist.
 */
export function buildDiversionMessage(
  topic: string,
  target: { name: string; status?: ChargerStatus },
  alternative: RankedCharger | null,
  input: PlanInput,
  destination: Coordinates & { name?: string },
  /** Ankunftszeit — entscheidet, ob "drei Stunden" oder "die Nacht über". */
  at: Date = new Date(),
): NtfyMessage {
  const message = spokenDiversion(target, alternative, input, at);

  const actions: NtfyMessage["actions"] = [];
  if (alternative) {
    actions.push({
      action: "view",
      label: "Hinfahren",
      url: driveToChargerUrl(alternative.charger),
    });
    actions.push({
      action: "view",
      label: "Zum Ziel",
      url: walkFromChargerUrl(alternative.charger, destination),
    });
  } else {
    // Keine Alternative: der Text sagt "Navigation stattdessen zum Ziel" —
    // dann muss der Knopf dazu auch da sein (Autofahrt, kein Fussweg).
    actions.push({ action: "view", label: "Zum Ziel", url: driveToUrl(destination) });
  }

  return {
    topic,
    title: "Ladeplanner",
    message,
    tags: ["battery"],
    priority: 5, // hoeher als der Ankunfts-Push: hier muss man reagieren
    actions,
  };
}
