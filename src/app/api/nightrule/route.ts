import { NextResponse } from "next/server";
import { fetchNearestChargingTags } from "@/lib/rules/overpass";
import { resolveNightRule } from "@/lib/rules/nightfree";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * GET /api/nightrule?lat=..&lng=..  (Konzept: Standzeit "nachts frei?")
 * Fragt OSM (Overpass) nach dem nächsten Ladepunkt und leitet die Regel ab.
 * Best-effort: bei Fehler -> verdict "unknown". Läuft server-seitig, damit
 * Overpass erreichbar ist (die Sandbox blockt es).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ verdict: "unknown", label: "Standzeit unbekannt" }, { status: 400 });
  }

  const tags = await fetchNearestChargingTags({ lat, lng }, 80, { timeoutMs: 6000 });
  const rule = resolveNightRule(tags);
  return NextResponse.json(rule, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
