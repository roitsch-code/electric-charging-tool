/**
 * Zieht den AFIR-Feed und druckt NUR das Struktur-Gerüst (Schlüssel-Baum mit
 * Typen), nicht die 13 MB Daten. So lässt sich der Parser an die konkrete
 * Anbieter-Verschachtelung (Smartlab/ladenetz) anpassen.
 *
 *   npm run mobilithek:inspect            # STATIC (Standard)
 *   npm run mobilithek:inspect -- --dyn   # DYNAMIC
 */
import {
  fetchMobilithekRaw,
  loadMobilithekTlsFromEnv,
  mobilithekSubscriptionUrl,
} from "../src/lib/realtime/mobilithek";

const MAX_DEPTH = 9;
const MAX_KEYS = 40;

function skeleton(v: unknown, depth = 0): unknown {
  if (depth >= MAX_DEPTH) return "…";
  if (Array.isArray(v)) {
    return v.length === 0 ? "[](0)" : { [`[](${v.length})`]: skeleton(v[0], depth + 1) };
  }
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    const keys = Object.keys(v as Record<string, unknown>).slice(0, MAX_KEYS);
    for (const k of keys) out[k] = skeleton((v as Record<string, unknown>)[k], depth + 1);
    return out;
  }
  if (typeof v === "string") return v.length > 40 ? `str(${v.slice(0, 40)}…)` : `str(${v})`;
  return typeof v;
}

async function main() {
  const dyn = process.argv.includes("--dyn");
  const sid = dyn
    ? process.env.MOBILITHEK_DYNAMIC_SUBSCRIPTION_ID
    : process.env.MOBILITHEK_STATIC_SUBSCRIPTION_ID;
  if (!sid) {
    console.error(`${dyn ? "DYNAMIC" : "STATIC"}-Subscription-ID fehlt in .env`);
    process.exit(1);
  }
  const url = mobilithekSubscriptionUrl(sid, { datex3: true });
  console.log(`Ziehe ${dyn ? "DYNAMIC" : "STATIC"}:`, url);
  const res = await fetchMobilithekRaw(url, loadMobilithekTlsFromEnv(), { timeoutMs: 120000 });
  console.log(`HTTP ${res.status} · ${res.body.length} Zeichen\n`);

  let root: unknown;
  try {
    root = JSON.parse(res.body);
  } catch {
    console.log("Kein JSON — erste 600 Zeichen:\n", res.body.slice(0, 600));
    return;
  }

  console.log("=== STRUKTUR-GERÜST ===");
  console.log(JSON.stringify(skeleton(root), null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
