/**
 * Importiert das BNetzA-Ladesaeulenregister aus einer lokalen CSV.
 *
 * Nutzung:
 *   1. CSV von der BNetzA-Seite herunterladen (siehe src/lib/import/bnetza.ts).
 *   2. npm run import:bnetza -- ./pfad/zur/ladesaeulen.csv
 *
 * --dry  parst nur und schreibt NICHT in die DB (kein DATABASE_URL noetig).
 * Sonst braucht es DATABASE_URL in der Umgebung (.env).
 */
import { readFileSync } from "node:fs";
import { parseBnetzaCsv } from "../src/lib/import/bnetza";
import { upsertChargers } from "../src/lib/import/upsert";

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const path = args.find((a) => !a.startsWith("--"));
  if (!path) {
    console.error("Pfad zur CSV fehlt. Beispiel: npm run import:bnetza -- ./ladesaeulen.csv");
    process.exit(1);
  }

  // BNetzA-CSV ist oft latin1 kodiert; wir versuchen utf-8 und fallen zurueck.
  const buf = readFileSync(path);
  let text = buf.toString("utf-8");
  if (text.includes("�")) {
    text = buf.toString("latin1");
    console.log("utf-8 zeigte Ersatzzeichen -> latin1 verwendet.");
  }

  const chargers = parseBnetzaCsv(text);
  console.log(`${chargers.length} Ladepunkte aus BNetzA-CSV geparst.`);
  if (chargers.length === 0) {
    console.error("Nichts geparst. Stimmt das Format? (Kopfzeile mit Breitengrad/Laengengrad?)");
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
