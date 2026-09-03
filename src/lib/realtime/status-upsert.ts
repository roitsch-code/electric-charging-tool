import type { PrismaClient } from "../../generated/prisma";
import type { StatusRecord } from "./types";

/**
 * Schreibt Verfuegbarkeitsstatus in chargepoint_status (Konzept §5.1).
 *
 * Wichtig: chargepoint_status hat einen Fremdschluessel auf chargepoints.
 * Statuswerte fuer unbekannte Ladepunkte werden deshalb uebersprungen (kein
 * Waisen-Status). Erst den statischen Bestand importieren, dann pollen.
 */
export async function upsertStatuses(
  prisma: PrismaClient,
  records: StatusRecord[],
  chunkSize = 500,
): Promise<{ updated: number; skipped: number }> {
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    const existing = await prisma.chargepoint.findMany({
      where: { evseId: { in: chunk.map((r) => r.evseId) } },
      select: { evseId: true },
    });
    const known = new Set(existing.map((e) => e.evseId));
    const valid = chunk.filter((r) => known.has(r.evseId));
    skipped += chunk.length - valid.length;

    await prisma.$transaction(
      valid.map((r) =>
        prisma.chargepointStatus.upsert({
          where: { evseId: r.evseId },
          create: {
            evseId: r.evseId,
            status: r.status,
            lastUpdated: new Date(r.lastUpdated),
            source: r.source,
          },
          update: {
            status: r.status,
            lastUpdated: new Date(r.lastUpdated),
            source: r.source,
          },
        }),
      ),
    );
    updated += valid.length;
  }

  return { updated, skipped };
}
