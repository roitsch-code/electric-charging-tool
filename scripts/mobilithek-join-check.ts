/**
 * End-to-End-Check: zieht AFIR Static + Dynamic live (mTLS), parst beide,
 * joint sie und zeigt, wie viele Standorte mit Belegung entstehen.
 *
 * Laeuft nur mit freiem Ausgang (Server). .env:
 *   MOBILITHEK_PFX + MOBILITHEK_PFX_PASSWORD (oder CERT/KEY)
 *   MOBILITHEK_STATIC_SUBSCRIPTION_ID
 *   MOBILITHEK_DYNAMIC_SUBSCRIPTION_ID
 *
 * Nutzung: npm run mobilithek:join
 */
import {
  fetchMobilithekRaw,
  loadMobilithekTlsFromEnv,
  mobilithekSubscriptionUrl,
} from "../src/lib/realtime/mobilithek";
import { parseAfirDynamic } from "../src/lib/realtime/datex-afir";
import { parseAfirStatic, buildAfirSnapshots } from "../src/lib/realtime/datex-afir-static";

async function pull(sid: string): Promise<string> {
  const url = mobilithekSubscriptionUrl(sid, { datex3: true });
  const res = await fetchMobilithekRaw(url, loadMobilithekTlsFromEnv(), { timeoutMs: 90000 });
  console.log(`  ${url}\n  HTTP ${res.status} · ${res.body.length} Zeichen`);
  return res.body;
}

async function main() {
  const staticSid = process.env.MOBILITHEK_STATIC_SUBSCRIPTION_ID;
  const dynSid = process.env.MOBILITHEK_DYNAMIC_SUBSCRIPTION_ID;
  if (!staticSid || !dynSid) {
    console.error("MOBILITHEK_STATIC_SUBSCRIPTION_ID und _DYNAMIC_SUBSCRIPTION_ID noetig.");
    process.exit(1);
  }

  console.log("Static ziehen:");
  const staticR = parseAfirStatic(await pull(staticSid));
  console.log("Dynamic ziehen:");
  const dynR = parseAfirDynamic(await pull(dynSid));

  const snaps = buildAfirSnapshots(staticR.points, dynR);

  console.log("\n=== Ergebnis ===");
  console.log(`Static-Ladepunkte:   ${staticR.points.length}  (info: ${staticR.informationStatus})`);
  console.log(`Dynamic-Status:      ${dynR.points.length}  (info: ${dynR.informationStatus})`);
  console.log(`Gejointe Standorte:  ${snaps.length}`);
  const freeTotal = snaps.reduce((a, s) => a + s.available, 0);
  const pointTotal = snaps.reduce((a, s) => a + s.total, 0);
  console.log(`Ladepunkte gematcht: ${pointTotal}, davon frei: ${freeTotal}`);
  console.log("\nErste 5 Standorte:");
  for (const s of snaps.slice(0, 5)) {
    console.log(
      `  ${s.lat.toFixed(5)},${s.lng.toFixed(5)}  ${s.available}/${s.total} frei  [${s.status}]  ${s.name ?? ""}`,
    );
  }
  if (snaps.length === 0) {
    console.log(
      "\n(0 Standorte: die idG aus Dynamic tauchen (noch) nicht im Static auf — " +
        "bei Testdaten normal. Kette funktioniert, sobald sich beide Feeds decken.)",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
