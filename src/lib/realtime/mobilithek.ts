import { readFileSync } from "node:fs";
import https from "node:https";
import { MOBILITHEK_M2M_CA } from "./mobilithek-ca";

/** Basis des Mobilithek-M2M-Brokers (Pull, mTLS, Port 8443). */
const BROKER_BASE = "https://mobilithek.info:8443/mobilithek/api/v1.0";

/**
 * Pull-URL fuer ein Abonnement. `datex3: true` waehlt den DATEX-II-v3-
 * Endpunkt (JSON), sonst den generischen Container-Endpunkt.
 */
export function mobilithekSubscriptionUrl(
  subscriptionId: string,
  opts: { datex3?: boolean } = {},
): string {
  const path = opts.datex3 ? "subscription/datexv3" : "subscription";
  return `${BROKER_BASE}/${path}?subscriptionID=${encodeURIComponent(subscriptionId)}`;
}

/**
 * Mobilithek-Zugang (Konzept §5.1, DE-weit).
 *
 * Die AFIR-Angebote auf der Mobilithek sind "gebrokert": Abruf per
 * Datennehmer-Pull ueber eine HTTPS-Schnittstelle mit **X.509-
 * Maschinenzertifikat (mTLS)**. Dieser Client kapselt genau diesen
 * Transport. Das Parsen uebernimmt danach der DATEX-Parser — abhaengig
 * davon, ob der Broker JSON oder XML liefert (wird am echten Sample
 * verifiziert, siehe scripts/mobilithek-sample.ts).
 */

export interface MobilithekTls {
  cert: string | Buffer;
  key: string | Buffer;
  ca?: string | Buffer;
}

export interface MobilithekResponse {
  status: number;
  contentType: string;
  body: string;
}

/** Roher mTLS-GET gegen eine Mobilithek-Pull-URL. */
export function fetchMobilithekRaw(
  url: string,
  tls: MobilithekTls,
  timeoutMs = 20000,
): Promise<MobilithekResponse> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: "GET",
        cert: tls.cert,
        key: tls.key,
        ca: tls.ca,
        headers: { "User-Agent": "ladeplanner/0.1 (n=1 hobby project)" },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            contentType: String(res.headers["content-type"] ?? ""),
            body: Buffer.concat(chunks).toString("utf-8"),
          }),
        );
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("mobilithek timeout")));
    req.end();
  });
}

/**
 * Laedt Zertifikat/Schluessel/CA aus der Umgebung. Jeder Wert ist entweder
 * ein Datei-PFAD oder direkt der PEM-Inhalt (erkannt an "BEGIN").
 *   MOBILITHEK_CERT, MOBILITHEK_KEY, MOBILITHEK_CA (CA optional)
 */
export function loadMobilithekTlsFromEnv(): MobilithekTls {
  const cert = readPemFromEnv("MOBILITHEK_CERT", true)!;
  const key = readPemFromEnv("MOBILITHEK_KEY", true)!;
  // CA: eigener Wert per Env, sonst die fest eingebaute Mobilithek-M2M-Kette.
  const ca = readPemFromEnv("MOBILITHEK_CA", false) ?? MOBILITHEK_M2M_CA;
  return { cert, key, ca };
}

function readPemFromEnv(name: string, required: boolean): string | undefined {
  const v = process.env[name];
  if (!v) {
    if (required) throw new Error(`${name} fehlt in der Umgebung (.env)`);
    return undefined;
  }
  return v.includes("BEGIN") ? v : readFileSync(v, "utf-8");
}
