import { describe, it, expect } from "vitest";
import {
  computeNotifyAt,
  computeWatchWindow,
  nachholGrenze,
  notifyLeadMinutes,
  watchLeadMinutes,
  NACHHOLFRIST_MINUTES,
} from "@/lib/notify/timing";

describe("notifyLeadMinutes (Konzept §3)", () => {
  it("< 100 km -> 5 min", () => {
    expect(notifyLeadMinutes(50)).toBe(5);
    expect(notifyLeadMinutes(99.9)).toBe(5);
  });
  it("100–300 km -> 10 min", () => {
    expect(notifyLeadMinutes(100)).toBe(10);
    expect(notifyLeadMinutes(300)).toBe(10);
  });
  it("> 300 km -> 15 min", () => {
    expect(notifyLeadMinutes(300.1)).toBe(15);
    expect(notifyLeadMinutes(500)).toBe(15);
  });
});

describe("watchLeadMinutes — Vorlauf nach Restfahrzeit", () => {
  it("Langstrecke: die vollen 15 Minuten", () => {
    expect(watchLeadMinutes(60)).toBe(15);
    expect(watchLeadMinutes(25)).toBe(15);
  });

  it("15–25 Minuten Fahrt -> 10 Minuten vorher", () => {
    expect(watchLeadMinutes(24)).toBe(10);
    expect(watchLeadMinutes(15)).toBe(10);
  });

  it("8–15 Minuten Fahrt -> 5 Minuten vorher", () => {
    expect(watchLeadMinutes(14)).toBe(5);
    expect(watchLeadMinutes(8)).toBe(5);
  });

  it("unter 8 Minuten -> 3 Minuten vorher", () => {
    expect(watchLeadMinutes(7)).toBe(3);
    expect(watchLeadMinutes(5)).toBe(3);
  });

  it("der Vorlauf ist nie so lang wie die Fahrt selbst", () => {
    // Sonst laege das Fenster VOR dem Losfahren — der Push kaeme nie.
    expect(watchLeadMinutes(4)).toBe(3);
    expect(watchLeadMinutes(3)).toBe(2);
    expect(watchLeadMinutes(2)).toBe(1);
    expect(watchLeadMinutes(1)).toBe(1);
    expect(watchLeadMinutes(0.5)).toBe(1);
  });
});

describe("computeWatchWindow", () => {
  const eta = new Date("2026-09-10T18:00:00Z");

  it("ohne Fahrzeit bleibt es bei 15 Minuten Vorlauf", () => {
    const w = computeWatchWindow(eta);
    expect(w.leadMinutes).toBe(15);
    expect(w.from.toISOString()).toBe("2026-09-10T17:45:00.000Z");
    expect(w.until.toISOString()).toBe("2026-09-10T18:10:00.000Z");
  });

  it("Kurzstrecke: Fenster beginnt spaeter, Gnadenfrist bleibt", () => {
    // Zehn Minuten Fahrt -> fuenf Minuten vor Ankunft.
    const w = computeWatchWindow(eta, 10);
    expect(w.leadMinutes).toBe(5);
    expect(w.from.toISOString()).toBe("2026-09-10T17:55:00.000Z");
    expect(w.until.toISOString()).toBe("2026-09-10T18:10:00.000Z");
  });

  it("Fenster beginnt nie vor der Abfahrt", () => {
    // Sechs Minuten Fahrt: Start waere 17:54 + 6 min = 18:00 Ankunft,
    // Fenster ab 17:57 — also nach dem Losfahren um 17:54.
    const abfahrt = new Date(eta.getTime() - 6 * 60_000);
    const w = computeWatchWindow(eta, 6);
    expect(w.from.getTime()).toBeGreaterThan(abfahrt.getTime());
  });
});

describe("nachholGrenze — verpasste Pushes nachholen, aber nicht ewig", () => {
  const now = new Date("2026-09-10T09:34:00Z");

  it("ein kurz verpasster Push wird nachgeholt", () => {
    // Zehn Minuten alt: noch aktuell, der Fahrer ist unterwegs.
    const notifyAt = new Date(now.getTime() - 10 * 60_000);
    expect(notifyAt >= nachholGrenze(now)).toBe(true);
  });

  it("die Fahrt von gestern wird NICHT nachgemeldet", () => {
    // Genau das ist passiert, als der interne Takt zum ersten Mal lief:
    // vier alte Fahrten auf einmal.
    const gestern = new Date(now.getTime() - 14 * 3600_000);
    expect(gestern >= nachholGrenze(now)).toBe(false);
  });

  it("die Grenze liegt eine halbe Stunde zurück", () => {
    expect(now.getTime() - nachholGrenze(now).getTime()).toBe(NACHHOLFRIST_MINUTES * 60_000);
  });
});

describe("computeNotifyAt", () => {
  it("zieht den Vorlauf von der ETA ab", () => {
    const eta = new Date("2026-09-03T18:00:00Z");
    // 250 km -> 10 min vorher
    expect(computeNotifyAt(eta, 250).toISOString()).toBe("2026-09-03T17:50:00.000Z");
    // 400 km -> 15 min vorher
    expect(computeNotifyAt(eta, 400).toISOString()).toBe("2026-09-03T17:45:00.000Z");
  });
});
