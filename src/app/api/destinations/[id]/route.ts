import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/destinations/:id  (Konzept §6)
 *
 * Liefert den aufgeloesten Trip. In M3 wird hier zusaetzlich das
 * Ladepunkt-Ranking (§8) mitgegeben.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const trip = await prisma.trip.findUnique({
    where: { id },
    include: { recommendations: { orderBy: { rank: "asc" } } },
  });

  if (!trip) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  return NextResponse.json({
    id: trip.id,
    lat: trip.resolvedLat,
    lng: trip.resolvedLng,
    name: trip.resolvedName,
    method: trip.resolutionMethod,
    dwellMinutes: trip.dwellMinutes,
    returnTripKm: trip.returnTripKm,
    status: trip.status,
    recommendations: trip.recommendations,
  });
}
