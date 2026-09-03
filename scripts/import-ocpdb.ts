/**
 * Importiert den STATISCHEN Ladepunkt-Bestand von OCPDB / MobiData BW.
 * Diese Quelle nutzt dieselben IDs wie der Realtime-Feed -> Voraussetzung
 * dafuer, dass der Poller (poll-realtime) Statuswerte zuordnen kann.
 *
 *   npm run import:ocpdb            # holt + schreibt in die DB (DATABASE_URL noetig)
 *   npm run import:ocpdb -- --dry   # holt + parst nur, ohne DB
 */
import { fetchOcpdbStatic } from "../src/lib/import/ocpdb";
import { upsertChargers } from "../src/lib/import/upsert";

async function main() {
  const dry = process.argv.includes("--dry");
  console.log("Hole OCPDB-Static (MobiData BW) ...");
  const chargers = await fetchOcpdbStatic();
  console.log(`${chargers.length} Ladepunkte geparst.`);
  if (chargers.length === 0) process.exit(2);

  if (dry) {
    console.log("--dry: kein DB-Schreibvorgang. Beispiel:");
    console.log(JSON.stringify(chargers[0], null, 2));
    return;
  }

  const { PrismaClient } = await import("../src/generated/prisma");
  const prisma = new PrismaClient();
  try {
    const { upserted } = await upsertChargers(prisma, chargers);
    console.log(`${upserted} Ladepunkte in die DB geschrieben (upsert).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
