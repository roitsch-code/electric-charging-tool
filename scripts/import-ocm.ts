/**
 * Importiert Ladepunkte von Open Charge Map.
 *
 * Nutzung:
 *   OCM_API_KEY in .env setzen (https://openchargemap.org/site/develop/api).
 *   npm run import:ocm -- --country DE [--max 5000]
 *
 * Braucht DATABASE_URL und OCM_API_KEY in der Umgebung.
 */
import { fetchOcmPois, mapOcmPois } from "../src/lib/import/ocm";
import { upsertChargers } from "../src/lib/import/upsert";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const apiKey = process.env.OCM_API_KEY;
  if (!apiKey) {
    console.error("OCM_API_KEY fehlt in der Umgebung (.env).");
    process.exit(1);
  }

  const countryCode = arg("country") ?? "DE";
  const maxResults = Number(arg("max") ?? "5000");

  console.log(`Hole OCM-POIs (country=${countryCode}, max=${maxResults}) ...`);
  const pois = await fetchOcmPois({ apiKey, countryCode, maxResults });
  const chargers = mapOcmPois(pois);
  console.log(`${pois.length} POIs geladen -> ${chargers.length} Ladepunkte gemappt.`);
  if (chargers.length === 0) process.exit(2);

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
