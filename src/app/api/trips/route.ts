import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveDestination, parsePlanInput } from "@/lib/planRequest";
import { computeEta, directionsKeyFromEnv } from "@/lib/notify/eta";
import { computeNotifyAt, notifyLeadMinutes } from "@/lib/notify/timing";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/trips  (Konzept §6 — "Losfahren"-Knopf)
 *
 * Legt eine Fahrt an und plant den Push. Ablauf:
 *   1. Ziel aus den Feldern aufloesen (lat/lng | u | to | q wie /api/plan).
 *   2. ETA ab Startpunkt (Geolocation) rechnen — Google Directions oder Schaetzung.
 *   3. notify_at = ETA minus Vorlauf (5/10/15 min je nach Distanz, §3).
 *   4. Trip speichern. Der dispatch-Cron verschickt den Push, sobald faellig.
 *
 * Body (JSON):
 *   origin: { lat, lng }          Startpunkt (Browser-Geolocation), Pflicht
 *   lat,lng | u | to | q | name   Ziel (wie /api/plan)
 *   dwell                         Minuten oder Label (kurz|paar|nacht|laenger)
 *   return                        Rueckfahrt in km
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid-json" }, { status: 400 });
  }

  const origin = body.origin as { lat?: unknown; lng?: unknown } | undefined;
  const oLat = toNum(origin?.lat);
  const oLng = toNum(origin?.lng);
  if (oLat === null || oLng === null) {
    return NextResponse.json(
      { ok: false, error: "origin-required", hint: "Standort (origin.lat/lng) fehlt." },
      { status: 400 },
    );
  }

  const dest = await resolveDestination({
    lat: str(body.lat),
    lng: str(body.lng),
    u: str(body.u),
    to: str(body.to),
    q: str(body.q),
    name: str(body.name),
  });
  if (!dest.ok || !dest.coords) {
    return NextResponse.json(
      { ok: false, error: "destination-unresolved", reason: dest.reason },
      { status: 422 },
    );
  }

  const input = parsePlanInput({ dwell: str(body.dwell), return: str(body.return) });

  const eta = await computeEta(
    { lat: oLat, lng: oLng },
    dest.coords,
    { apiKey: directionsKeyFromEnv() },
  );

  const now = Date.now();
  const etaAt = new Date(now + eta.etaSeconds * 1000);
  const notifyAt = computeNotifyAt(etaAt, eta.distanceKm);
  const leadMinutes = notifyLeadMinutes(eta.distanceKm);

  const trip = await prisma.trip.create({
    data: {
      rawShareUrl: str(body.q) ?? str(body.u) ?? str(body.to) ?? "",
      resolvedLat: dest.coords.lat,
      resolvedLng: dest.coords.lng,
      resolvedName: dest.coords.name ?? null,
      resolutionMethod:
        dest.method === "geocode" || dest.method === "redirect" || dest.method === "manual"
          ? dest.method
          : null,
      dwellMinutes: input.dwellMinutes,
      returnTripKm: input.returnTripKm,
      startedAt: new Date(now),
      eta: etaAt,
      etaUpdatedAt: new Date(now),
      notifyAt,
      status: "driving",
    },
  });

  return NextResponse.json({
    ok: true,
    tripId: trip.id,
    eta: etaAt.toISOString(),
    notifyAt: notifyAt.toISOString(),
    leadMinutes,
    distanceKm: eta.distanceKm,
    etaSource: eta.source,
    destination: dest.coords,
  });
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function str(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return null;
}
