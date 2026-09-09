import { prisma } from "@/lib/db";
import { planDestination } from "@/lib/chargers";
import { getChargerSource } from "@/lib/chargers/source-factory";
import { getAvailabilityProvider } from "@/lib/availability";
import type { ChargerStatus } from "@/lib/chargers/types";
import { buildDiversionMessage, pickAlternative } from "./message";
import { pushTransport, sendPush } from "./send";
import { ensureTripWatchTable } from "./watch-db";
import { decideWatch, nextState, probeTarget, type WatchState } from "./watch";

/**
 * Ein Durchlauf des Notification-Pushers (vom Minuten-Cron aufgerufen).
 *
 * Für jede aktive Überwachung im Zeitfenster: Säule erneut abfragen, mit dem
 * zuletzt bekannten Zustand vergleichen, bei "null frei" einen Push mit
 * Alternative schicken. Alles andere wird nur protokolliert — kein Push, wenn
 * bloß 3/4 auf 2/4 fällt, und keiner bei unbekanntem Zustand.
 */

const MAX_PER_TICK = 10;

export interface WatchTickResult {
  ok: boolean;
  checked: number;
  pushed: string[];
  finished: string[];
  skipped?: string;
  at: string;
}

interface WatchRow {
  trip_id: string;
  evse_id: string;
  name: string;
  lat: number;
  lng: number;
  status: string;
  free: number | null;
  total: number | null;
  diversions: number;
  dwell_minutes: number | null;
  return_trip_km: number | null;
  resolved_lat: number | null;
  resolved_lng: number | null;
  resolved_name: string | null;
}

export async function runWatchTick(now = new Date()): Promise<WatchTickResult> {
  const at = now.toISOString();
  if (!pushTransport()) {
    return {
      ok: false,
      checked: 0,
      pushed: [],
      finished: [],
      skipped: "Kein Versandweg: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID oder NTFY_TOPIC setzen",
      at,
    };
  }
  // Nur für ntfy relevant; Telegram adressiert über die Chat-ID.
  const topic = process.env.NTFY_TOPIC ?? "";

  await ensureTripWatchTable();

  // Fällige Überwachungen: im Fenster, noch nicht abgeschlossen.
  const rows = await prisma.$queryRaw<WatchRow[]>`
    SELECT w.trip_id, w.evse_id, w.name, w.lat, w.lng, w.status, w.free, w.total,
           w.diversions, t.dwell_minutes, t.return_trip_km,
           t.resolved_lat, t.resolved_lng, t.resolved_name
    FROM trip_watch w
    JOIN trips t ON t.id = w.trip_id
    WHERE w.done_at IS NULL
      AND w.watch_from <= ${now}
      AND w.watch_until >= ${now}
    ORDER BY w.watch_from ASC
    LIMIT ${MAX_PER_TICK}
  `;

  const source = getChargerSource();
  const pushed: string[] = [];
  const finished: string[] = [];

  for (const row of rows) {
    const previous: WatchState = {
      status: row.status as ChargerStatus,
      free: row.free,
      total: row.total,
    };

    let probe: Awaited<ReturnType<typeof probeTarget>> = null;
    try {
      probe = await probeTarget(
        { evseId: row.evse_id, lat: row.lat, lng: row.lng },
        source,
      );
    } catch {
      // Abfrage fehlgeschlagen -> wie "unbekannt" behandeln, nächster Tick.
    }

    const decision = decideWatch(previous, probe?.state ?? null, {
      alreadyPushed: row.diversions > 0,
    });
    const updated = nextState(previous, probe?.state ?? null);

    if (!decision.push) {
      await prisma.$executeRaw`
        UPDATE trip_watch
        SET checked_at = ${now}, checks = checks + 1, updated_at = ${now},
            status = ${updated.status}, free = ${updated.free ?? null}, total = ${updated.total ?? null}
        WHERE trip_id = ${row.trip_id}
      `;
      continue;
    }

    // Belegt: frische Planung am Ziel, Alternative wählen, Push schicken.
    const destination = {
      lat: row.resolved_lat ?? row.lat,
      lng: row.resolved_lng ?? row.lng,
      name: row.resolved_name ?? undefined,
    };
    const input = { dwellMinutes: row.dwell_minutes, returnTripKm: row.return_trip_km };
    let alternative = null;
    try {
      const plan = await planDestination(destination, input, source, getAvailabilityProvider());
      alternative = pickAlternative(plan, { evseId: row.evse_id, lat: row.lat, lng: row.lng });
    } catch {
      // Ohne Alternative geht der Push trotzdem raus — die Info "belegt" ist
      // für sich schon handlungsrelevant.
    }

    // Status mitgeben, damit der Text stimmt: "außer Betrieb" ist nicht "belegt".
    const msg = buildDiversionMessage(
      topic,
      { name: row.name, status: probe?.state.status },
      alternative,
      input,
      destination,
    );
    let sentOk = false;
    try {
      sentOk = (await sendPush(msg)).ok;
    } catch {
      sentOk = false;
    }

    if (sentOk) {
      pushed.push(row.trip_id);
      finished.push(row.trip_id);
      await prisma.$executeRaw`
        UPDATE trip_watch
        SET checked_at = ${now}, checks = checks + 1, updated_at = ${now},
            status = ${updated.status}, free = ${updated.free ?? null}, total = ${updated.total ?? null},
            diversions = diversions + 1, last_push_at = ${now},
            done_at = ${now}, done_reason = ${decision.reason}
        WHERE trip_id = ${row.trip_id}
      `;
      await prisma.trip
        .update({ where: { id: row.trip_id }, data: { status: "diverted" } })
        .catch(() => undefined);
    } else {
      // Versand fehlgeschlagen: Vorzustand NICHT fortschreiben, damit der
      // nächste Tick denselben Wechsel erneut erkennt.
      await prisma.$executeRaw`
        UPDATE trip_watch
        SET checked_at = ${now}, checks = checks + 1, updated_at = ${now}
        WHERE trip_id = ${row.trip_id}
      `;
    }
  }

  // Abgelaufene Überwachungen schließen (Ankunft + Gnadenfrist vorbei) und die
  // zugehörige Fahrt beenden — sonst bliebe sie für immer in der Cron-Abfrage.
  const expired = await prisma.$queryRaw<{ trip_id: string }[]>`
    UPDATE trip_watch
    SET done_at = ${now}, done_reason = 'expired', updated_at = ${now}
    WHERE done_at IS NULL AND watch_until < ${now}
    RETURNING trip_id
  `;
  if (expired.length > 0) {
    await prisma.trip
      .updateMany({
        where: { id: { in: expired.map((r) => r.trip_id) }, status: { in: ["planned", "driving"] } },
        data: { status: "done" },
      })
      .catch(() => undefined);
    finished.push(...expired.map((r) => r.trip_id));
  }

  return { ok: true, checked: rows.length, pushed, finished, at };
}
