import type { NtfyMessage } from "./ntfy";

/**
 * Telegram-Bot als Versandweg — der Weg, der im Auto tatsächlich vorgelesen
 * wird (Konzept §6.6, Risiko "hoch").
 *
 * Hintergrund: iOS kündigt Benachrichtigungen von Drittanbieter-Apps nur an,
 * wenn die App sie als zeitkritisch oder als Direktnachricht kennzeichnet.
 * ntfy tut das nicht zuverlässig (offenes Issue binwiederhier/ntfy#1680: die
 * Berechtigungen dafür sind im Xcode-Projekt nicht eingerichtet). Telegram
 * dagegen unterstützt "Mitteilungen ankündigen" seit Ende 2020 als erste
 * Drittanbieter-App — seine Nachrichten sind für iOS echte Direktnachrichten.
 *
 * Die Deeplinks kommen als Inline-Tastatur, nicht in den Text: Der Text wird
 * vorgelesen, eine URL darin würde Zeichen für Zeichen mitgesprochen. Die
 * Knöpfe stehen im Chat und lassen sich im Stand antippen.
 */

type FetchFn = typeof fetch;

const API = "https://api.telegram.org";

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

/** Liest die Bot-Zugangsdaten aus der Umgebung; null, wenn nicht eingerichtet. */
export function telegramFromEnv(): TelegramConfig | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  return botToken && chatId ? { botToken, chatId } : null;
}

/**
 * Siri kündigt bei Telegram zuerst den ABSENDER an und liest dann den Text
 * ("Nachricht von Ladeplanner: …"). Das Präfix im Text wäre damit doppelt.
 * Voraussetzung: Der Bot heißt "Ladeplanner" (so in @BotFather anlegen).
 */
const PREFIX = "Ladeplanner: ";

export function stripAppPrefix(text: string): string {
  return text.startsWith(PREFIX) ? text.slice(PREFIX.length) : text;
}

/** Actions -> Inline-Tastatur, eine Reihe mit bis zu zwei Knöpfen. */
function inlineKeyboard(msg: NtfyMessage): { inline_keyboard: { text: string; url: string }[][] } | undefined {
  if (!msg.actions?.length) return undefined;
  return {
    inline_keyboard: [msg.actions.map((a) => ({ text: a.label, url: a.url }))],
  };
}

export async function sendTelegram(
  msg: NtfyMessage,
  config: TelegramConfig,
  opts: { fetchFn?: FetchFn } = {},
): Promise<{ ok: boolean; status: number }> {
  const doFetch = opts.fetchFn ?? fetch;
  const res = await doFetch(`${API}/bot${config.botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: config.chatId,
      // Kein Markdown/HTML: der Text wird vorgelesen, Auszeichnung bringt nichts
      // und Sonderzeichen würden nur Escaping-Fehler riskieren.
      text: stripAppPrefix(msg.message),
      reply_markup: inlineKeyboard(msg),
    }),
  });
  return { ok: res.ok, status: res.status };
}
