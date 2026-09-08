import { haversineMeters } from "@/lib/chargers/geo";
import type { Charger, ChargerSource, ChargerStatus } from "@/lib/chargers/types";
import type { Coordinates } from "@/lib/resolver/types";

/**
 * Notification-Pusher — die reine Entscheidungslogik (ohne DB, ohne Netz).
 *
 * Ab 15 min vor Ankunft (siehe timing.ts, WATCH_LEAD_MINUTES) prüft der
 * Minuten-Cron die angefahrene Säule. Regeln, wie besprochen:
 *
 *   - frei  →  0 frei / belegt / defekt   ⇒ PUSH mit Alternative
 *   - 3/4 frei → 2/4 frei                 ⇒ kein Push (noch frei)
 *   - 0 frei                              ⇒ IMMER Push (auch ohne Vorzustand)
 *   - Zustand unbekannt (kein Live-Wert)  ⇒ kein Push (nichts halluzinieren)
 *   - Säule nicht mehr in der Antwort     ⇒ kein Push (Datenlücke ≠ belegt)
 *
 * "Belegt" heißt hier: null freie Punkte. Ein defekter Punkt (outoforder)
 * zählt genauso — dort laden kann man auch nicht.
 */

/** Radius, in dem ein Suchtreffer als DIESELBE Säule gilt (m). */
export const SAME_CHARGER_M = 60;

/** Zustand einer Säule, so weit er für die Entscheidung zählt. */
export interface WatchState {
  status: ChargerStatus;
  /** Freie Punkte; null/undefined = unbekannt. */
  free?: number | null;
  total?: number | null;
}

export type WatchDecision =
  | { push: false; reason: "still-free" | "unknown" | "gone" | "already-pushed" | "was-not-free" }
  | { push: true; reason: "became-occupied" | "occupied" };

/** Ist der Zustand belastbar bekannt? (Ehrlichkeitsgebot §5.1) */
export function isKnownState(s: WatchState | null | undefined): boolean {
  return !!s && s.status !== "unknown";
}

/**
 * Sind aktuell null Punkte frei? Zählt `free`, wenn vorhanden — sonst den
 * Status. Bei unbekanntem Zustand: null (= keine Aussage).
 */
export function isBlocked(s: WatchState | null | undefined): boolean | null {
  if (!isKnownState(s)) return null;
  const st = s!;
  if (typeof st.free === "number") return st.free <= 0;
  if (st.status === "available") return false;
  return st.status === "occupied" || st.status === "outoforder";
}

/**
 * Die Kernentscheidung: Push oder nicht?
 *
 * @param previous Zuletzt bekannter Zustand (beim Losfahren gespeichert bzw.
 *                 vom letzten Tick fortgeschrieben).
 * @param current  Jetzt gemessener Zustand; null = Säule nicht gefunden.
 * @param opts.alreadyPushed Für diese Fahrt wurde schon umgeleitet — dann
 *                 nicht erneut pushen (kein Push-Gewitter im Minutentakt).
 */
export function decideWatch(
  previous: WatchState | null | undefined,
  current: WatchState | null,
  opts: { alreadyPushed?: boolean } = {},
): WatchDecision {
  if (opts.alreadyPushed) return { push: false, reason: "already-pushed" };
  if (!current) return { push: false, reason: "gone" };

  const blockedNow = isBlocked(current);
  if (blockedNow === null) return { push: false, reason: "unknown" };
  if (!blockedNow) return { push: false, reason: "still-free" };

  // Ab hier: null Punkte frei. Das ist IMMER ein Push — auch wenn die Säule
  // schon beim Losfahren belegt war (dann weiß der Fahrer es beim Ankommen
  // spätestens jetzt) …
  const wasBlocked = isBlocked(previous);
  if (wasBlocked === false) return { push: true, reason: "became-occupied" };
  return { push: true, reason: "occupied" };
}

/** Übernimmt den gemessenen Zustand als neuen Vorzustand (nur wenn bekannt). */
export function nextState(previous: WatchState, current: WatchState | null): WatchState {
  return current && isKnownState(current) ? current : previous;
}

/** Zustand aus einem Charger lesen. */
export function stateOf(c: Charger): WatchState {
  return {
    status: c.status ?? "unknown",
    free: c.freePoints ?? null,
    total: c.totalPoints ?? null,
  };
}

/**
 * Sucht die überwachte Säule in der Umgebung erneut und liest ihren aktuellen
 * Zustand. Match über die EVSE-ID, sonst über die Koordinate (TomTom-IDs
 * können sich zwischen Abfragen ändern, die Position nicht).
 */
export async function probeTarget(
  target: { evseId: string; lat: number; lng: number },
  source: ChargerSource,
  radiusM = 400,
): Promise<{ charger: Charger; state: WatchState } | null> {
  const found = await source.within({ lat: target.lat, lng: target.lng }, radiusM);
  const byId = found.find((c) => c.evseId === target.evseId);
  const match = byId ?? nearestWithin(found, target, SAME_CHARGER_M);
  return match ? { charger: match, state: stateOf(match) } : null;
}

function nearestWithin(
  chargers: Charger[],
  at: Coordinates,
  maxM: number,
): Charger | null {
  let best: Charger | null = null;
  let bestD = Infinity;
  for (const c of chargers) {
    const d = haversineMeters(at, { lat: c.lat, lng: c.lng });
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best && bestD <= maxM ? best : null;
}
