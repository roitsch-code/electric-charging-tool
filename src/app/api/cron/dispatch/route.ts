import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { planDestination } from "@/lib/chargers";
import { getChargerSource } from "@/lib/chargers/source-factory";
import { getAvailabilityProvider } from "@/lib/availability";
import { buildPushMessage } from "@/lib/notify/message";
import { sendNtfy } from "@/lib/notify/ntfy";
import { runWatchTick } from "@/lib/notify/watch-tick";
import { assertCron } from "../guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/dispatch  (Cron im Minutentakt; Konzept §6)
 *
 * Zwei Aufgaben in einem Lauf:
 *   1. Ankunfts-Push: faellige Trips (notify_at erreicht, noch nicht
 *      benachrichtigt) -> Empfehlung bauen und per ntfy schicken.
 *   2. Notification-Pusher: ueberwachte Saeulen pruefen (ab 15 min vor
 *      Ankunft) und bei "null frei" einen Ausweich-Push schicken
 *      (src/lib/notify/watch-tick.ts).
 *
 * Zeitgesteuert statt Geofencing (Konzept §6, "Warum kein Geofencing").
 */
export async function GET(request: Request) {
  const denied = assertCron(request);
  if (denied) return denied;

  const topic = process.env.NTFY_TOPIC;
  if (!topic) {
    return NextResponse.json(
      { ok: false, error: "NTFY_TOPIC nicht gesetzt" },
      { status: 500 },
    );
  }

  const now = new Date();

  // 1. Notification-Pusher: ueberwachte Saeulen pruefen (eigener Fehlerraum —
  // ein Problem dort darf den Ankunfts-Push nicht verhindern).
  let watch: Awaited<ReturnType<typeof runWatchTick>> | { ok: false; error: string };
  try {
    watch = await runWatchTick(now);
  } catch (e) {
    watch = { ok: false, error: e instanceof Error ? e.message : "watch-failed" };
  }

  // 2. Ankunfts-Push wie gehabt.
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

  // Fahrten mit ueberwachter Saeule bekommen KEINEN Ankunfts-Push: dort ist
  // die Saeule schon gewaehlt, gemeldet wird nur, wenn sie belegt ist.
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
    const input = {
      dwellMinutes: trip.dwellMinutes,
      returnTripKm: trip.returnTripKm,
    };
    // Live-Belegung genau jetzt pruefen (das ist der Sinn des Pushs).
    const plan = await planDestination(coords, input, source, availability);
    const msg = buildPushMessage(topic, plan, input, coords);
    const result = await sendNtfy(msg);

    if (result.ok) {
      await prisma.trip.update({
        where: { id: trip.id },
        data: { notifiedAt: new Date(), status: "notified" },
      });
      sent.push(trip.id);
    }
  }

  return NextResponse.json({
    ok: true,
    due: due.length,
    sent,
    watched: [...watched],
    watch,
    at: now.toISOString(),
  });
}
