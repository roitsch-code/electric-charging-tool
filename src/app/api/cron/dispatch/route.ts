import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { planDestination } from "@/lib/chargers";
import { getChargerSource } from "@/lib/chargers/source-factory";
import { getAvailabilityProvider } from "@/lib/availability";
import { buildPushMessage } from "@/lib/notify/message";
import { sendNtfy } from "@/lib/notify/ntfy";
import { assertCron } from "../guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/dispatch  (Vercel Cron, Minutentakt; Konzept §6)
 * Sucht faellige Trips (notify_at erreicht, noch nicht benachrichtigt),
 * baut die Empfehlung und schickt den ntfy-Push. Zeitgesteuert statt
 * Geofencing (Konzept §6, "Warum kein Geofencing").
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

  for (const trip of due) {
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

  return NextResponse.json({ ok: true, due: due.length, sent, at: now.toISOString() });
}
