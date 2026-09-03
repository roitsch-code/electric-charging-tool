import { resolveManualAddress, resolveShareUrl } from "@/lib/resolver";
import type { Coordinates } from "@/lib/resolver/types";
import type { PlanInput } from "@/lib/chargers";

export interface DestinationResolution {
  ok: boolean;
  coords?: Coordinates & { name?: string };
  method?: "redirect" | "geocode" | "manual" | "coords";
  needsManualInput?: boolean;
  placeNameHint?: string;
  reason?: string;
}

/**
 * Ermittelt das Ziel aus flexiblen Parametern — Reihenfolge:
 *   1. lat & lng direkt  (Demo/Test ohne Netz)
 *   2. u = Share-URL     (voller Resolver, Konzept §4)
 *   3. to = Adresse      (manuelles Geocoding, Stufe 3)
 */
export async function resolveDestination(params: {
  lat?: string | number | null;
  lng?: string | number | null;
  u?: string | null;
  to?: string | null;
  name?: string | null;
}): Promise<DestinationResolution> {
  const lat = toNum(params.lat);
  const lng = toNum(params.lng);
  if (lat !== null && lng !== null) {
    return {
      ok: true,
      method: "coords",
      coords: { lat, lng, name: params.name?.trim() || undefined },
    };
  }

  if (params.u && params.u.trim()) {
    const r = await resolveShareUrl(params.u.trim());
    return fromResolution(r);
  }

  if (params.to && params.to.trim()) {
    const r = await resolveManualAddress(params.to.trim());
    return fromResolution(r);
  }

  return {
    ok: false,
    needsManualInput: true,
    reason: "no-destination-input",
  };
}

function fromResolution(
  r: Awaited<ReturnType<typeof resolveShareUrl>>,
): DestinationResolution {
  if (r.ok) {
    return {
      ok: true,
      method: r.method,
      coords: { lat: r.lat, lng: r.lng, name: r.name },
    };
  }
  return {
    ok: false,
    needsManualInput: true,
    placeNameHint: r.placeNameHint,
    reason: r.reason,
  };
}

/** Aufenthaltsdauer aus Minuten-Zahl ODER Kurzbefehl-Label (Konzept §3). */
export function parseDwellMinutes(
  value: string | number | null | undefined,
): number | null {
  const n = toNum(value);
  if (n !== null) return Math.round(n);
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v.includes("nacht")) return 480; // ueber Nacht
  if (v.includes("kurz")) return 30;
  if (v.includes("laeng") || v.includes("läng") || v.includes("lang")) return 720;
  if (v.includes("stund") || v.includes("paar")) return 180;
  return null;
}

export function parsePlanInput(params: {
  dwell?: string | number | null;
  return?: string | number | null;
}): PlanInput {
  return {
    dwellMinutes: parseDwellMinutes(params.dwell),
    returnTripKm: toNum(params.return),
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
