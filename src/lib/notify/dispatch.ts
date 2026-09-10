import { prisma } from "@/lib/db";
import { planDestination } from "@/lib/chargers";
import { getChargerSource } from "@/lib/chargers/source-factory";
import { getAvailabilityProvider } from "@/lib/availability";
import { buildPushMessage } from "./message";
import { pushTransport, sendPush } from "./send";
import { runWatchTick } from "./watch-tick";
import { recordBeat } from "./beat";

/**
 * Ein Durchlauf: überwachte Säulen prüfen + fällige Ankunfts-Pushes schicken.
 *
 * Steht bewusst hier und nicht in der Route: Die App taktet sich selbst
 * (siehe src/instrumentation.ts), die Route `/api/cron/dispatch` ist nur noch
 * der zweite Weg von außen. Vorher hing alles an ofelia + docker exec +
 * korrekt gequotetem Authorization-Header — drei Teile, die still ausfallen
 * können, ohne dass in der App etwas davon ankommt.
 */

export interface DispatchResult {
  ok: boolean;
  error?: string;
  due: number;
  sent: string[];
  watched: string[];
  watch?: unknown;
  at: string;
}

export async function runDispatch(now = new Date()): Promise<DispatchResult> {
  const at = now.toISOString();

  if (!pushTransport()) {
    await recordBeat("dispatch", false, "kein-versandweg", now);
    return {
      ok: false,
      error: "Kein Versandweg: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID oder NTFY_TOPIC setzen",
      due: 0,
      sent: [],
      watched: [],
      at,
    };
  }
  // Nur fuer ntfy relevant; Telegram adressiert ueber die Chat-ID.
  const topic = process.env.NTFY_TOPIC ?? "";

  // 1. Notification-Pusher: ueberwachte Saeulen pruefen (eigener Fehlerraum —
  // ein Problem dort darf den Ankunfts-Push nicht verhindern).
  let watch: Awaited<ReturnType<typeof runWatchTick>> | { ok: false; error: string };
  try {
    watch = await runWatchTick(now);
  } catch (e) {
    watch = { ok: false, error: e instanceof Error ? e.message : "watch-failed" };
  }

  // 2. Ankunfts-Push fuer Fahrten ohne ausgewaehlte Saeule.
  const due = await prisma.trip.findMany({
    where: {
      status: { in: ["planned", "driving"] },
      notifiedAt: null,
      notifyAt: { not: null, lte: now },
      resolvedLat: { not: null },
      resolvedLng: { not: null },
    },
    take: 20,
  });

  const source = getChargerSource();
  const availability = getAvailabilityProvider();
  const sent: string[] = [];

  // Fahrten mit ueberwachter Saeule bekommen KEINEN Ankunfts-Push von hier:
  // ihrer kommt aus dem Watch-Durchlauf und handelt von der gewaehlten Saeule.
  const watched = new Set<string>();
  try {
    const rows = await prisma.tripWatch.findMany({
      where: { tripId: { in: due.map((t) => t.id) } },
      select: { tripId: true },
    });
    for (const r of rows) watched.add(r.tripId);
  } catch {
    // Tabelle fehlt (noch) -> niemand wird uebersprungen.
  }

  for (const trip of due) {
    if (watched.has(trip.id)) continue;
    const coords = {
      lat: trip.resolvedLat!,
      lng: trip.resolvedLng!,
      name: trip.resolvedName ?? undefined,
    };
    const input = { dwellMinutes: trip.dwellMinutes, returnTripKm: trip.returnTripKm };
    // Live-Belegung genau jetzt pruefen (das ist der Sinn des Pushs).
    const plan = await planDestination(coords, input, source, availability);
    const result = await sendPush(buildPushMessage(topic, plan, input, coords));

    if (result.ok) {
      await prisma.trip.update({
        where: { id: trip.id },
        data: { notifiedAt: new Date(), status: "notified" },
      });
      sent.push(trip.id);
    }
  }

  await recordBeat(
    "dispatch",
    true,
    `faellig ${due.length}, verschickt ${sent.length}, ueberwacht ${"checked" in watch ? watch.checked : 0}`,
    now,
  );

  return { ok: true, due: due.length, sent, watched: [...watched], watch, at };
}
