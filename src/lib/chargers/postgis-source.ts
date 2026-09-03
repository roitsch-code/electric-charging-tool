import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import type { Coordinates } from "@/lib/resolver/types";
import type { Charger, ChargerSource, ChargerStatus } from "./types";

/**
 * Umkreissuche per PostGIS (Konzept §5.1, M2). Nutzt `ST_DWithin` auf einer
 * inline aus lat/lng gebildeten geography — funktioniert auch ohne separate
 * Geometriespalte. Fuer Tempo legt `prisma/sql/postgis.sql` einen passenden
 * funktionalen GIST-Index an (optional; ohne ihn Sequential Scan, fuer n=1 ok).
 *
 * Gleiche Signatur wie SeedChargerSource -> Ranking/Seite bleiben unveraendert.
 */

interface Row {
  evse_id: string;
  lat: number;
  lng: number;
  operator: string | null;
  power_kw: number | null;
  connector: string | null;
  connector_type: string | null;
  address: string | null;
  source: string;
  status: string | null;
  status_updated_at: Date | null;
  dist_m: number;
}

const AT_DESTINATION_M = 30;

function toStatus(s: string | null): ChargerStatus {
  return s === "available" || s === "occupied" || s === "outoforder"
    ? s
    : "unknown";
}

export class PostgisChargerSource implements ChargerSource {
  async within(center: Coordinates, radiusM: number): Promise<Charger[]> {
    const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${center.lng}, ${center.lat}), 4326)::geography`;

    const rows = await prisma.$queryRaw<Row[]>`
      SELECT c.evse_id, c.lat, c.lng, c.operator, c.power_kw, c.connector,
             c.connector_type, c.address, c.source,
             s.status AS status, s.last_updated AS status_updated_at,
             ST_Distance(
               ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography,
               ${point}
             ) AS dist_m
      FROM chargepoints c
      LEFT JOIN chargepoint_status s ON s.evse_id = c.evse_id
      WHERE ST_DWithin(
        ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography,
        ${point},
        ${radiusM}
      )
      ORDER BY dist_m ASC
      LIMIT 200
    `;

    return rows.map((r) => ({
      evseId: r.evse_id,
      name: r.operator ?? r.evse_id,
      lat: r.lat,
      lng: r.lng,
      operator: r.operator ?? undefined,
      powerKw: r.power_kw ?? 0,
      connector: r.connector === "dc" ? "dc" : "ac",
      connectorType: r.connector_type ?? undefined,
      address: r.address ?? undefined,
      atDestination: r.dist_m <= AT_DESTINATION_M,
      status: toStatus(r.status),
      statusUpdatedAt: r.status_updated_at
        ? r.status_updated_at.toISOString()
        : undefined,
    }));
  }
}
