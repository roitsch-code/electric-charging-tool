/**
 * Importiert den Ladepunkt-Bestand aus dem Mobilithek-AFIR-*Static*-Feed
 * (offiziell, DE-weit) in die DB. Aggregiert je Standort zu einer Station
 * mit Anzahl/Leistung/Stromart und upsertet nach evse_id.
 *
 * Laeuft NUR mit freiem Ausgang (Server) — der Broker-Pull ist mTLS auf
 * Port 8443. .env noetig:
 *   MOBILITHEK_PFX + MOBILITHEK_PFX_PASSWORD   (oder MOBILITHEK_CERT/KEY)
 *   MOBILITHEK_STATIC_SUBSCRIPTION_ID
 *   DATABASE_URL
 *
 * Nutzung:
 *   npm run import:afir           # zieht, aggregiert, schreibt in die DB
 *   npm run import:afir -- --dry  # nur ziehen + aggregieren, kein DB-Schreiben
 */
import {
  fetchMobilithekRaw,
  loadMobilithekTlsFromEnv,
  mobilithekSubscriptionUrl,
} from "../src/lib/realtime/mobilithek";
import { parseAfirStatic, aggregateAfirStations } from "../src/lib/realtime/datex-afir-static";
import { upsertChargers } from "../src/lib/import/upsert";

async function main() {
  const dry = process.argv.includes("--dry");
  const sid = process.env.MOBILITHEK_STATIC_SUBSCRIPTION_ID;
  if (!sid) {
    console.error("MOBILITHEK_STATIC_SUBSCRIPTION_ID fehlt in der Umgebung (.env).");
    process.exit(1);
  }

  const url = mobilithekSubscriptionUrl(sid, { datex3: true });
  console.log("AFIR Static ziehen:", url);
  const res = await fetchMobilithekRaw(url, loadMobilithekTlsFromEnv(), { timeoutMs: 120000 });
  console.log(`HTTP ${res.status} · ${res.body.length} Zeichen`);
  if (res.status !== 200) {
    console.error("Kein 200 vom Broker — Abo/Zertifikat prüfen.");
    process.exit(2);
  }

  const parsed = parseAfirStatic(res.body);
  const stations = aggregateAfirStations(parsed.points);
  console.log(
    `${parsed.points.length} Ladepunkte -> ${stations.length} Stationen ` +
      `(info: ${parsed.informationStatus}, Stand: ${parsed.publicationTime}).`,
  );
  if (stations.length === 0) {
    console.error("0 Stationen — Feed leer oder Struktur unerwartet.");
    process.exit(3);
  }

  if (dry) {
    // Verifikation: liegt das Zuhause (Düsseldorf, Ackerstraße) echt im Feed?
    const HOME = { lat: 51.2303831, lng: 6.8091339 };
    const distM = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      const dLat = (b.lat - a.lat) * 111320;
      const dLng = (b.lng - a.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180);
      return Math.round(Math.hypot(dLat, dLng));
    };
    const near = stations
      .map((s) => ({ s, d: distM(HOME, s) }))
      .filter((x) => x.d <= 3000)
      .sort((a, b) => a.d - b.d);
    console.log(`\n--dry: kein DB-Schreiben.`);
    console.log(`Stationen im 3-km-Umkreis Düsseldorf-Ackerstraße: ${near.length}`);
    for (const { s, d } of near.slice(0, 15)) {
      console.log(`  ${d} m  ${s.connector.toUpperCase()} ${s.powerKw}kW  ${s.totalPoints}× | ${s.operator ?? s.name ?? "?"} | ${s.address ?? ""}`);
    }
    console.log("\nGlobale Beispiele:");
    console.log(JSON.stringify(stations.slice(0, 2), null, 2));
    return;
  }

  const { PrismaClient } = await import("../src/generated/prisma");
  const prisma = new PrismaClient();
  try {
    // Spalte idempotent sicherstellen (kein separater Migrations-Schritt nötig).
    await prisma.$executeRawUnsafe(
      "ALTER TABLE chargepoints ADD COLUMN IF NOT EXISTS total_points integer",
    );
    const { upserted } = await upsertChargers(prisma, stations);
    console.log(`${upserted} Stationen in die DB geschrieben (upsert).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
