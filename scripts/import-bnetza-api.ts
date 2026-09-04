/**
 * Importiert den DE-weiten Bestand der BNetzA-API (Nationale Leitstelle,
 * Mobilithek-Angebot "BNetzA Liste aus Webserviceschnittstelle", Open Data)
 * aus den drei CSVs (Ladestation, Ladepunkt, Stecker).
 *
 *   npm run import:bnetza-api -- <ladestation.csv> <ladepunkt.csv> <stecker.csv> [--dry]
 *
 * --dry parst + joint nur (kein DB-Schreibvorgang, kein DATABASE_URL noetig).
 */
import { readFileSync } from "node:fs";
import { parseBnetzaApi } from "../src/lib/import/bnetza-api";
import { upsertChargers } from "../src/lib/import/upsert";

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const files = args.filter((a) => !a.startsWith("--"));
  const [ladestation, ladepunkt, stecker] = files;
  if (!ladestation || !ladepunkt || !stecker) {
    console.error(
      "Drei Dateien noetig: npm run import:bnetza-api -- <ladestation.csv> <ladepunkt.csv> <stecker.csv> [--dry]",
    );
    process.exit(1);
  }

  console.log("Lese CSVs ...");
  const chargers = parseBnetzaApi({
    ladestationCsv: readFileSync(ladestation, "utf8"),
    ladepunktCsv: readFileSync(ladepunkt, "utf8"),
    steckerCsv: readFileSync(stecker, "utf8"),
  });
  const dc = chargers.filter((c) => c.connector === "dc").length;
  console.log(`${chargers.length} Ladepunkte gejoint (${dc} DC, ${chargers.length - dc} AC).`);
  if (chargers.length === 0) {
    console.error("Nichts gejoint. Passen die drei Dateien zusammen? (Koordinaten in der Ladestation?)");
    process.exit(2);
  }

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
