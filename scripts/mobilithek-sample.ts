/**
 * Zieht EINE Beispielantwort von einer Mobilithek-Pull-URL (mTLS) und legt
 * sie als Datei ab. Damit sehen wir das echte Format (JSON oder XML) und
 * die Struktur der AFIR-Static/Dynamic-Feeds von Road B.V. — Grundlage, um
 * den DATEX-Parser final zu verifizieren.
 *
 * Voraussetzung: Abo auf der Mobilithek + Maschinenzertifikat.
 *   .env: MOBILITHEK_CERT, MOBILITHEK_KEY, MOBILITHEK_CA (optional)
 * Nutzung:
 *   npm run mobilithek:sample -- "<pull-url>" [ausgabedatei]
 */
import { writeFileSync } from "node:fs";
import { fetchMobilithekRaw, loadMobilithekTlsFromEnv } from "../src/lib/realtime/mobilithek";

async function main() {
  const url = process.argv[2];
  const out = process.argv[3] ?? "mobilithek-sample.txt";
  if (!url) {
    console.error('Pull-URL fehlt. Beispiel: npm run mobilithek:sample -- "https://mobilithek.info/.../clientPullService/..."');
    process.exit(1);
  }

  const tls = loadMobilithekTlsFromEnv();
  const res = await fetchMobilithekRaw(url, tls);
  console.log(`HTTP ${res.status}, Content-Type: ${res.contentType}, ${res.body.length} Zeichen`);
  writeFileSync(out, res.body);
  console.log(`Gespeichert: ${out}`);
  console.log("--- erste 800 Zeichen ---");
  console.log(res.body.slice(0, 800));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
