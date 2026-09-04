import type { ChargerStatus } from "@/lib/chargers/types";
import type { Coordinates } from "@/lib/resolver/types";
import type { AvailabilityProvider, AvailabilitySnapshot } from "./types";

/**
 * Google Places API (New) als Belegungsquelle (Konzept §5.1).
 *
 * searchNearby (POST) mit Typ "electric_vehicle_charging_station" liefert je
 * Ort `evChargeOptions.connectorAggregation[]` mit `availableCount`,
 * `outOfServiceCount` und `availabilityLastUpdateTime` — die Echtzeitfelder.
 *
 * Kosten: das Feld evChargeOptions loest die "Place Details Enterprise +
 * Atmosphere"-SKU aus; on-demand fuer wenige Orte pro Fahrt bleibt das im
 * monatlichen Gratis-Guthaben.
 */

const URL = "https://places.googleapis.com/v1/places:searchNearby";
const FIELD_MASK = "places.location,places.displayName,places.evChargeOptions";
const TIMEOUT_MS = 6000;
const MAX_RESULTS = 20;

interface ConnectorAggregation {
  count?: number;
  availableCount?: number;
  outOfServiceCount?: number;
  availabilityLastUpdateTime?: string;
}
interface GooglePlace {
  location?: { latitude?: number; longitude?: number };
  displayName?: { text?: string };
  evChargeOptions?: { connectorAggregation?: ConnectorAggregation[] };
}

/** Aggregiert die connectorAggregation eines Orts zu einem Status. */
export function aggregateGoogleStatus(place: GooglePlace): {
  status: ChargerStatus;
  available: number;
  total: number;
  lastUpdate: string | null;
} {
  const aggs = place.evChargeOptions?.connectorAggregation ?? [];
  let a = 0, x = 0, c = 0;
  let hasRealtime = false;
  let lastUpdate: string | null = null;
  for (const agg of aggs) {
    c += agg.count ?? 0;
    if (agg.availableCount !== undefined || agg.availabilityLastUpdateTime) {
      hasRealtime = true;
      a += agg.availableCount ?? 0;
      x += agg.outOfServiceCount ?? 0;
      if (agg.availabilityLastUpdateTime && (!lastUpdate || agg.availabilityLastUpdateTime > lastUpdate)) {
        lastUpdate = agg.availabilityLastUpdateTime;
      }
    }
  }
  let status: ChargerStatus = "unknown";
  if (hasRealtime) {
    if (a > 0) status = "available";
    else if (c > 0 && x >= c) status = "outoforder";
    else status = "occupied";
  }
  return { status, available: a, total: c, lastUpdate };
}

export class GoogleAvailabilityProvider implements AvailabilityProvider {
  constructor(private readonly key: string) {}

  async near(center: Coordinates, radiusM: number): Promise<AvailabilitySnapshot[]> {
    const body = {
      includedTypes: ["electric_vehicle_charging_station"],
      maxResultCount: MAX_RESULTS,
      locationRestriction: {
        circle: {
          center: { latitude: center.lat, longitude: center.lng },
          radius: Math.min(Math.max(radiusM, 100), 50000),
        },
      },
    };
    let data: { places?: GooglePlace[] };
    try {
      const res = await fetch(URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.key,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return [];
      data = (await res.json()) as { places?: GooglePlace[] };
    } catch {
      return [];
    }

    const now = new Date().toISOString();
    const out: AvailabilitySnapshot[] = [];
    for (const p of data.places ?? []) {
      const lat = p.location?.latitude;
      const lng = p.location?.longitude;
      if (typeof lat !== "number" || typeof lng !== "number") continue;
      if (!p.evChargeOptions) continue;
      const agg = aggregateGoogleStatus(p);
      out.push({
        lat,
        lng,
        name: p.displayName?.text,
        status: agg.status,
        available: agg.available,
        total: agg.total,
        fetchedAt: agg.lastUpdate ?? now,
      });
    }
    return out;
  }
}
