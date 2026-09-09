import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendTelegram, stripAppPrefix, telegramFromEnv } from "@/lib/notify/telegram";
import { pushTransport } from "@/lib/notify/send";
import type { NtfyMessage } from "@/lib/notify/ntfy";

const MSG: NtfyMessage = {
  topic: "egal",
  title: "Ladeplanner",
  message: "Ladeplanner: Parkhaus Ottensen ist belegt. Ausweichen auf Supermarkt-Parkplatz.",
  priority: 5,
  actions: [
    { action: "view", label: "Hinfahren", url: "https://maps.example/drive" },
    { action: "view", label: "Zum Ziel", url: "https://maps.example/walk" },
  ],
};

beforeEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  delete process.env.NTFY_TOPIC;
});

describe("sendTelegram", () => {
  it("POSTet an die Bot-API mit Text und Inline-Tastatur", async () => {
    const fake = vi.fn(
      (_url: string, _init?: RequestInit): Promise<Response> =>
        Promise.resolve(new Response("{}", { status: 200 })),
    );
    const res = await sendTelegram(
      MSG,
      { botToken: "123:ABC", chatId: "42" },
      { fetchFn: fake as unknown as typeof fetch },
    );

    expect(res.ok).toBe(true);
    const [url, init] = fake.mock.calls[0]!;
    expect(url).toBe("https://api.telegram.org/bot123:ABC/sendMessage");
    expect(init!.method).toBe("POST");

    const body = JSON.parse(String(init!.body)) as Record<string, unknown>;
    expect(body.chat_id).toBe("42");
    // Siri kuendigt den Absender an ("Ladeplanner") und liest dann den Text —
    // das Praefix im Text waere doppelt und faellt deshalb weg.
    expect(body.text).toBe("Parkhaus Ottensen ist belegt. Ausweichen auf Supermarkt-Parkplatz.");
    // Die Links duerfen NICHT im Text stehen (Siri liest sonst die URL mit).
    expect(String(body.text)).not.toContain("http");

    const markup = body.reply_markup as { inline_keyboard: { text: string; url: string }[][] };
    expect(markup.inline_keyboard[0]).toEqual([
      { text: "Hinfahren", url: "https://maps.example/drive" },
      { text: "Zum Ziel", url: "https://maps.example/walk" },
    ]);
  });

  it("ohne Actions keine Tastatur", async () => {
    const fake = vi.fn(
      (_url: string, _init?: RequestInit): Promise<Response> =>
        Promise.resolve(new Response("{}", { status: 200 })),
    );
    await sendTelegram(
      { ...MSG, actions: [] },
      { botToken: "t", chatId: "1" },
      { fetchFn: fake as unknown as typeof fetch },
    );
    const body = JSON.parse(String(fake.mock.calls[0]![1]!.body)) as Record<string, unknown>;
    expect(body.reply_markup).toBeUndefined();
  });

  it("meldet Fehlschlag der Bot-API", async () => {
    const fake = vi.fn(
      (_url: string, _init?: RequestInit): Promise<Response> =>
        Promise.resolve(new Response("nope", { status: 401 })),
    );
    const res = await sendTelegram(
      MSG,
      { botToken: "t", chatId: "1" },
      { fetchFn: fake as unknown as typeof fetch },
    );
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });
});

describe("stripAppPrefix", () => {
  it("entfernt das Praefix, das Siri ohnehin als Absender ansagt", () => {
    expect(stripAppPrefix("Ladeplanner: Saeule ist belegt.")).toBe("Saeule ist belegt.");
  });
  it("laesst Texte ohne Praefix unveraendert", () => {
    expect(stripAppPrefix("Saeule ist belegt.")).toBe("Saeule ist belegt.");
  });
});

describe("telegramFromEnv / pushTransport", () => {
  it("ohne Konfiguration: kein Versandweg", () => {
    expect(telegramFromEnv()).toBeNull();
    expect(pushTransport()).toBeNull();
  });

  it("nur NTFY_TOPIC -> ntfy", () => {
    process.env.NTFY_TOPIC = "t";
    expect(pushTransport()).toBe("ntfy");
  });

  it("Telegram hat Vorrang vor ntfy (nur dort wird vorgelesen)", () => {
    process.env.NTFY_TOPIC = "t";
    process.env.TELEGRAM_BOT_TOKEN = "123:ABC";
    process.env.TELEGRAM_CHAT_ID = "42";
    expect(pushTransport()).toBe("telegram");
    expect(telegramFromEnv()).toEqual({ botToken: "123:ABC", chatId: "42" });
  });

  it("halbe Telegram-Konfiguration zaehlt nicht", () => {
    process.env.TELEGRAM_BOT_TOKEN = "123:ABC";
    expect(telegramFromEnv()).toBeNull();
    expect(pushTransport()).toBeNull();
  });
});
