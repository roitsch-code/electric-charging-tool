import { NextResponse } from "next/server";
import { resolveManualAddress, resolveShareUrl } from "@/lib/resolver";
import { prisma } from "@/lib/db";

/**
 * POST /api/destinations  (Konzept §6, Phase 1)
 *
 * Nimmt eine geteilte Google-Maps-URL entgegen, loest sie zu Koordinaten
 * auf (Resolver, §4) und legt einen Trip an.
 *
 * Body:
 *   { shareUrl: string, dwellMinutes?: number, returnTripKm?: number }
 * Manueller Fallback (Stufe 3), wenn die Aufloesung zuvor scheiterte:
 *   { manualAddress: string, dwellMinutes?: number, returnTripKm?: number }
 *
 * Bei fehlgeschlagener Aufloesung: 422 mit needsManualInput + Namens-Hint,
 * damit die App das Eingabefeld zeigt (§4, Stufe 3). Es wird KEIN Trip
 * angelegt, bevor Koordinaten feststehen.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const { shareUrl, manualAddress, dwellMinutes, returnTripKm } =
    (body ?? {}) as {
      shareUrl?: unknown;
      manualAddress?: unknown;
      dwellMinutes?: unknown;
      returnTripKm?: unknown;
    };

  const hasShareUrl = typeof shareUrl === "string" && shareUrl.trim() !== "";
  const hasManual =
    typeof manualAddress === "string" && manualAddress.trim() !== "";

  if (!hasShareUrl && !hasManual) {
    return NextResponse.json(
      { error: "shareUrl-or-manualAddress-required" },
      { status: 400 },
    );
  }

  const resolution = hasManual
    ? await resolveManualAddress(manualAddress as string)
    : await resolveShareUrl(shareUrl as string);

  if (!resolution.ok) {
    return NextResponse.json(
      {
        needsManualInput: true,
        placeNameHint: resolution.placeNameHint ?? null,
        reason: resolution.reason,
      },
      { status: 422 },
    );
  }

  const trip = await prisma.trip.create({
    data: {
      rawShareUrl: hasManual ? `manual:${manualAddress}` : (shareUrl as string),
      resolvedLat: resolution.lat,
      resolvedLng: resolution.lng,
      resolvedName: resolution.name ?? null,
      resolutionMethod: resolution.method,
      dwellMinutes: coerceInt(dwellMinutes),
      returnTripKm: coerceInt(returnTripKm),
      status: "planned",
    },
  });

  return NextResponse.json(
    {
      id: trip.id,
      lat: trip.resolvedLat,
      lng: trip.resolvedLng,
      name: trip.resolvedName,
      method: trip.resolutionMethod,
      status: trip.status,
    },
    { status: 201 },
  );
}

function coerceInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return null;
}
