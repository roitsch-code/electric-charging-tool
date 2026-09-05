/**
 * Zieht EINE Beispielantwort vom Mobilithek-Broker (mTLS) und legt sie als
 * Datei ab. Damit sehen wir das echte DATEX-II-v3-JSON der AFIR-Dynamic-Daten
 * (Road B.V.) und koennen den Parser final dagegen bauen.
 *
 * Laeuft NUR mit freiem Ausgang (Server), nicht in der CI-/Agent-Sandbox
 * (deren Proxy bricht mTLS ab).
 *
 * Zugangsdaten aus .env (eine der beiden Varianten):
 *   MOBILITHEK_PFX=/pfad/certificate.p12   MOBILITHEK_PFX_PASSWORD=…   (einfachster Weg)
 *   ODER  MOBILITHEK_CERT + MOBILITHEK_KEY
 * Abo:
 *   MOBILITHEK_DYNAMIC_SUBSCRIPTION_ID=1033003052646182912
 *
 * Nutzung:
 *   npm run mobilithek:sample                 # nutzt subscriptionID aus .env
 *   npm run mobilithek:sample -- "<pull-url>" [ausgabedatei]
 */
import { writeFileSync } from "node:fs";
import {
  fetchMobilithekRaw,
  loadMobilithekTlsFromEnv,
  mobilithekSubscriptionUrl,
} from "../src/lib/realtime/mobilithek";

async function main() {
  const argUrl = process.argv[2];
  const out = process.argv[3] ?? "mobilithek-sample.json";

  const sid = process.env.MOBILITHEK_DYNAMIC_SUBSCRIPTION_ID;
  const url =
    argUrl ?? (sid ? mobilithekSubscriptionUrl(sid, { datex3: true }) : undefined);
  if (!url) {
    console.error(
      "Keine URL. Setze MOBILITHEK_DYNAMIC_SUBSCRIPTION_ID in .env " +
        'oder gib die Pull-URL an: npm run mobilithek:sample -- "<url>"',
    );
    process.exit(1);
  }

  console.log(`Pull: ${url}`);
  const tls = loadMobilithekTlsFromEnv();
  const res = await fetchMobilithekRaw(url, tls, { timeoutMs: 60000 });
  console.log(`HTTP ${res.status} · ${res.contentType} · ${res.body.length} Zeichen`);

  if (res.status === 304) {
    console.log(
      "304 Not Modified — aktuell kein neues Datenpaket. Auth funktioniert! " +
        "Spaeter erneut ziehen (oder ohne If-Modified-Since).",
    );
    return;
  }
  if (res.status === 204 || res.body.length === 0) {
    console.log(
      "Leer (kein Datenpaket verfuegbar). Auth ok — spaeter erneut versuchen.",
    );
    return;
  }

  writeFileSync(out, res.body);
  console.log(`Gespeichert: ${out}`);
  console.log("--- erste 1200 Zeichen ---");
  console.log(res.body.slice(0, 1200));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
