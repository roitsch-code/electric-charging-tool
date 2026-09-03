import type { PrismaClient } from "../../generated/prisma";
import type { Charger } from "../chargers/types";

/**
 * Schreibt Ladepunkte in die DB (Konzept §5.1, statischer Cache). Upsert je
 * evse_id, damit ein erneuter Import aktualisiert statt zu duplizieren. In
 * Chunks, um lange Transaktionen zu vermeiden.
 */
export async function upsertChargers(
  prisma: PrismaClient,
  chargers: Charger[],
  chunkSize = 500,
): Promise<{ upserted: number }> {
  let upserted = 0;
  for (let i = 0; i < chargers.length; i += chunkSize) {
    const chunk = chargers.slice(i, i + chunkSize);
    await prisma.$transaction(
      chunk.map((c) =>
        prisma.chargepoint.upsert({
          where: { evseId: c.evseId },
          create: {
            evseId: c.evseId,
            lat: c.lat,
            lng: c.lng,
            operator: c.operator ?? null,
            powerKw: c.powerKw ?? null,
            connector: c.connector,
            connectorType: c.connectorType ?? null,
            address: c.address ?? null,
            source: c.source ?? "unknown",
          },
          update: {
            lat: c.lat,
            lng: c.lng,
            operator: c.operator ?? null,
            powerKw: c.powerKw ?? null,
            connector: c.connector,
            connectorType: c.connectorType ?? null,
            address: c.address ?? null,
            source: c.source ?? "unknown",
          },
        }),
      ),
    );
    upserted += chunk.length;
  }
  return { upserted };
}
