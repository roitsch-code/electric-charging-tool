import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveDestination, parsePlanInput } from "@/lib/planRequest";
import { computeEta, directionsKeyFromEnv } from "@/lib/notify/eta";
import {
  computeNotifyAt,
  computeWatchWindow,
  notifyLeadMinutes,
  WATCH_LEAD_MINUTES,
} from "@/lib/notify/timing";
import { ensureTripWatchTable } from "@/lib/notify/watch-db";

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
 *   target                        angefahrene Ladesaeule (optional):
 *                                 { evseId, name, lat, lng, status, free, total }
 *                                 -> schaltet den Notification-Pusher scharf:
 *                                 ab 15 min vor Ankunft im Minutentakt pruefen,
 *                                 ob sie noch frei ist (siehe notify/watch.ts).
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

  // Angefahrene Saeule ueberwachen (Notification-Pusher). Scheitert das (z. B.
  // fehlende Tabelle), bleibt die Fahrt trotzdem bestehen — der Ankunfts-Push
  // haengt nicht daran.
  let watch: { from: string; until: string; leadMinutes: number } | null = null;
  const target = parseTarget(body.target);
  if (target) {
    const win = computeWatchWindow(etaAt);
    try {
      await ensureTripWatchTable();
      await prisma.$executeRaw`
        INSERT INTO trip_watch (trip_id, evse_id, name, lat, lng, status, free, total,
                                watch_from, watch_until, created_at, updated_at)
        VALUES (${trip.id}, ${target.evseId}, ${target.name}, ${target.lat}, ${target.lng},
                ${target.status}, ${target.free}, ${target.total},
                ${win.from}, ${win.until}, ${new Date(now)}, ${new Date(now)})
        ON CONFLICT (trip_id) DO UPDATE SET
          evse_id = EXCLUDED.evse_id, name = EXCLUDED.name,
          lat = EXCLUDED.lat, lng = EXCLUDED.lng, status = EXCLUDED.status,
          free = EXCLUDED.free, total = EXCLUDED.total,
          watch_from = EXCLUDED.watch_from, watch_until = EXCLUDED.watch_until,
          done_at = NULL, done_reason = NULL, updated_at = EXCLUDED.updated_at
      `;
      watch = {
        from: win.from.toISOString(),
        until: win.until.toISOString(),
        leadMinutes: WATCH_LEAD_MINUTES,
      };
    } catch {
      watch = null;
    }
  }

  return NextResponse.json({
    ok: true,
    tripId: trip.id,
    eta: etaAt.toISOString(),
    notifyAt: notifyAt.toISOString(),
    leadMinutes,
    distanceKm: eta.distanceKm,
    etaSource: eta.source,
    destination: dest.coords,
    watch,
  });
}

/** Liest die zu ueberwachende Saeule aus dem Body (alles optional ausser Ort). */
function parseTarget(v: unknown): {
  evseId: string;
  name: string;
  lat: number;
  lng: number;
  status: string;
  free: number | null;
  total: number | null;
} | null {
  if (!v || typeof v !== "object") return null;
  const t = v as Record<string, unknown>;
  const lat = toNum(t.lat);
  const lng = toNum(t.lng);
  if (lat === null || lng === null) return null;
  const status = typeof t.status === "string" ? t.status : "unknown";
  return {
    evseId: str(t.evseId) ?? `${lat},${lng}`,
    name: str(t.name) ?? "Ladepunkt",
    lat,
    lng,
    status: ["available", "occupied", "outoforder", "unknown"].includes(status) ? status : "unknown",
    free: toNum(t.free),
    total: toNum(t.total),
  };
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
