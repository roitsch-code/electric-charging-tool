import { describe, it, expect } from "vitest";
import { befund, seit, type DiagInput, type DiagWatch } from "@/lib/notify/diagnose";
import type { Beat } from "@/lib/notify/beat";

/**
 * Der Befund muss die eine Frage beantworten: Warum kam (kein) Push? Jede
 * Ursache bekommt einen eigenen Satz — "irgendwas ist schiefgelaufen" hilft
 * unterwegs niemandem.
 */

const NOW = new Date("2026-09-09T21:00:00Z");

function beat(over: Partial<Beat> = {}): Beat {
  return {
    job: "dispatch",
    lastRunAt: new Date(NOW.getTime() - 40_000),
    ok: true,
    detail: null,
    runs: 1200,
    lastDeniedAt: null,
    ...over,
  };
}

function watch(over: Partial<DiagWatch> = {}): DiagWatch {
  return {
    tripId: "trip-1",
    name: "Nollenburger Weg 34",
    watchFrom: new Date(NOW.getTime() - 30 * 60_000),
    watchUntil: new Date(NOW.getTime() - 5 * 60_000),
    checks: 25,
    checkedAt: new Date(NOW.getTime() - 6 * 60_000),
    startPushAt: null,
    diversions: 0,
    lastReason: "still-free",
    lastError: null,
    doneAt: null,
    doneReason: null,
    ...over,
  };
}

function run(over: Partial<DiagInput> = {}): string[] {
  return befund({
    now: NOW,
    transport: "telegram",
    beats: [beat()],
    watches: [watch()],
    ...over,
  });
}

describe("befund", () => {
  it("fehlender Versandweg steht ganz oben und heisst FEHLER", () => {
    const b = run({ transport: null });
    expect(b[0]).toContain("FEHLER");
    expect(b[0]).toContain("TELEGRAM_BOT_TOKEN");
  });

  it("stummer Cron wird benannt, nicht beschoenigt", () => {
    const b = run({ beats: [beat({ lastRunAt: new Date(NOW.getTime() - 3 * 3600_000) })] });
    expect(b.some((s) => s.includes("FEHLER") && s.includes("feuert nicht"))).toBe(true);
  });

  it("nie gelaufener Cron: eigener Satz mit dem Ort zum Nachsehen", () => {
    const b = run({ beats: [] });
    expect(b.some((s) => s.includes("noch nie gemeldet") && s.includes("ofelia"))).toBe(true);
  });

  it("401 wird als Secret-Problem erkannt, nicht als toter Cron", () => {
    const b = run({
      beats: [
        beat({
          lastRunAt: new Date(NOW.getTime() - 3600_000),
          lastDeniedAt: new Date(NOW.getTime() - 30_000),
        }),
      ],
    });
    expect(b.some((s) => s.includes("CRON_SECRET"))).toBe(true);
  });

  it("nie geprueftes Fenster ist ein Fehler, kein Schweigen", () => {
    const b = run({ watches: [watch({ checks: 0, checkedAt: null })] });
    expect(b.some((s) => s.includes("KEIN einziges Mal geprüft"))).toBe(true);
  });

  it("freie Saeule: sagt, dass Schweigen hier richtig war", () => {
    const b = run();
    expect(b.some((s) => s.includes("Säule war bei jeder Prüfung frei"))).toBe(true);
    expect(b.some((s) => s.includes("blieb frei"))).toBe(true);
  });

  it("verschickter Ankunfts-Push verweist auf den Zustellweg", () => {
    const b = run({ watches: [watch({ startPushAt: new Date(NOW.getTime() - 20 * 60_000) })] });
    expect(b.some((s) => s.includes("Ankunfts-Push") && s.includes("Zustellweg"))).toBe(true);
  });

  it("gar keine Ueberwachung: nennt das fehlende target", () => {
    const b = run({ watches: [] });
    expect(b.some((s) => s.includes("target"))).toBe(true);
  });

  it("Abfragefehler werden im Klartext durchgereicht", () => {
    const b = run({ watches: [watch({ lastReason: "unknown", lastError: "tomtom search 403" })] });
    expect(b.some((s) => s.includes("tomtom search 403"))).toBe(true);
  });
});

describe("seit", () => {
  it("rechnet in der Einheit, die man auch sagen würde", () => {
    expect(seit(new Date(NOW.getTime() - 41_000), NOW)).toBe("vor 41 Sekunden");
    expect(seit(new Date(NOW.getTime() - 8 * 60_000), NOW)).toBe("vor 8 Minuten");
    expect(seit(new Date(NOW.getTime() - 5 * 3600_000), NOW)).toBe("vor 5 Stunden");
    expect(seit(new Date(NOW.getTime() - 3 * 86_400_000), NOW)).toBe("vor 3 Tagen");
  });
});
