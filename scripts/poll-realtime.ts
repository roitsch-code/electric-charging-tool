/**
 * Holt den MobiData-BW-Realtime-Feed und schreibt die Verfuegbarkeit in die
 * DB. Lokales Gegenstueck zum Cron-Endpunkt /api/cron/poll.
 *
 *   npm run poll:realtime           # holt + schreibt (DATABASE_URL noetig)
 *   npm run poll:realtime -- --dry  # holt + parst nur, ohne DB
 */
import { fetchMobidataRealtime } from "../src/lib/realtime/mobidata";
import { upsertStatuses } from "../src/lib/realtime/status-upsert";

async function main() {
  const dry = process.argv.includes("--dry");
  console.log("Hole MobiData-BW-Realtime ...");
  const records = await fetchMobidataRealtime();
  const byStatus = records.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`${records.length} Statuswerte geparst:`, byStatus);

  if (dry) {
    console.log("--dry: kein DB-Schreibvorgang. Beispiel:", JSON.stringify(records[0]));
    return;
  }

  const { PrismaClient } = await import("../src/generated/prisma");
  const prisma = new PrismaClient();
  try {
    const { updated, skipped } = await upsertStatuses(prisma, records);
    console.log(`${updated} Status aktualisiert, ${skipped} uebersprungen (unbekannte Ladepunkte).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
