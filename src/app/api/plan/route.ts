import { NextResponse } from "next/server";
import {
  driveToChargerUrl,
  planDestination,
  spokenForPlan,
  walkFromChargerUrl,
} from "@/lib/chargers";
import { getChargerSource } from "@/lib/chargers/source-factory";
import { getAvailabilityProvider } from "@/lib/availability";
import {
  parsePlanInput,
  resolveDestination,
} from "@/lib/planRequest";

/**
 * GET /api/plan  (Konzept §8, End-to-End ohne Push)
 *
 * Parameter (alle als Query, damit ein Kurzbefehl per GET reicht):
 *   lat, lng        Zielkoordinaten direkt (Demo/Test), ODER
 *   u               geteilte Google-Maps-URL (voller Resolver), ODER
 *   to              Adresse (manuelles Geocoding)
 *   name            optionaler Zielname
 *   dwell           Minuten ODER Label (kurz|paar|nacht|laenger)
 *   return          Rueckfahrt in km
 *
 * Antwort: Bedarfsklasse, Top-3-Ranking mit Deeplinks, Sprechtext (§6.6)
 * und Datenaktualitaet (§5.1).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const dest = await resolveDestination({
    lat: searchParams.get("lat"),
    lng: searchParams.get("lng"),
    u: searchParams.get("u"),
    to: searchParams.get("to"),
    name: searchParams.get("name"),
  });

  if (!dest.ok || !dest.coords) {
    return NextResponse.json(
      {
        needsManualInput: true,
        placeNameHint: dest.placeNameHint ?? null,
        reason: dest.reason,
      },
      { status: 422 },
    );
  }

  const input = parsePlanInput({
    dwell: searchParams.get("dwell"),
    return: searchParams.get("return"),
  });

  const plan = await planDestination(
    dest.coords,
    input,
    getChargerSource(),
    getAvailabilityProvider(),
  );

  return NextResponse.json({
    destination: dest.coords,
    resolutionMethod: dest.method,
    dwellMinutes: input.dwellMinutes,
    returnTripKm: input.returnTripKm,
    demandClass: plan.demandClass,
    usedRadiusM: plan.usedRadiusM,
    expanded: plan.expanded,
    candidateCount: plan.candidateCount,
    dataTimestamp: plan.dataTimestamp,
    spokenRecommendation: spokenForPlan(plan, input, 0),
    spokenAlternative: spokenForPlan(plan, input, 1),
    top: plan.top.map((r) => ({
      rank: r.rank,
      evseId: r.charger.evseId,
      name: r.charger.name,
      operator: r.charger.operator ?? null,
      connector: r.charger.connector,
      powerKw: r.charger.powerKw,
      usablePowerKw: r.usablePowerKw,
      atDestination: Boolean(r.charger.atDestination),
      walkingM: r.walkingM,
      airlineM: r.airlineM,
      status: r.charger.status ?? "unknown",
      statusUpdatedAt: r.charger.statusUpdatedAt ?? null,
      score: r.score,
      driveUrl: driveToChargerUrl(r.charger),
      walkUrl: walkFromChargerUrl(r.charger, dest.coords!),
    })),
  });
}
