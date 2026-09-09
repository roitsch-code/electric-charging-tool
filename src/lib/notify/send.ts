import type { NtfyMessage } from "./ntfy";
import { sendNtfy } from "./ntfy";
import { sendTelegram, stripAppPrefix, telegramFromEnv } from "./telegram";

/**
 * Versandweg für Pushes. Telegram hat Vorrang, weil nur dort das Vorlesen im
 * Auto belegt funktioniert (siehe telegram.ts); ntfy bleibt als Rückfall.
 */
export type Transport = "telegram" | "ntfy";

/** Welcher Weg ist eingerichtet? null = gar keiner. */
export function pushTransport(): Transport | null {
  if (telegramFromEnv()) return "telegram";
  if (process.env.NTFY_TOPIC) return "ntfy";
  return null;
}

export interface SendResult {
  ok: boolean;
  status: number;
  via: Transport | null;
  /** Der Text, wie er tatsächlich rausging (Telegram kürzt das Präfix). */
  text: string;
}

/** Verschickt über den eingerichteten Weg. Ohne Einrichtung: ok = false. */
export async function sendPush(msg: NtfyMessage): Promise<SendResult> {
  const telegram = telegramFromEnv();
  if (telegram) {
    const r = await sendTelegram(msg, telegram);
    return { ...r, via: "telegram", text: stripAppPrefix(msg.message) };
  }
  if (process.env.NTFY_TOPIC) {
    const r = await sendNtfy(msg);
    return { ...r, via: "ntfy", text: msg.message };
  }
  return { ok: false, status: 0, via: null, text: msg.message };
}
