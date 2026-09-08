import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NtfyMessage } from "@/lib/notify/ntfy";

/**
 * Integrationstest fuer den Notification-Pusher-Durchlauf: DB -> Sonde ->
 * Entscheidung -> Versand. Die Datenbank ist gefaelscht (kein Postgres noetig,
 * laeuft in der CI mit), der Versand wird abgefangen. Die Ladepunkt-Quelle ist
 * der Seed — dort ist "Parkhaus Ottensen" immer belegt (null von sechs frei)
 * und "Schnellladepark Bahrenfeld" immer frei (drei von vier).
 */

const db = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  expired: [] as { trip_id: string }[],
  /** Alle abgesetzten Schreib-Anweisungen als reiner SQL-Text. */
  writes: [] as string[],
  tripUpdates: [] as unknown[],
  tripUpdateManys: [] as unknown[],
}));

const sent = vi.hoisted(() => ({ messages: [] as NtfyMessage[], ok: true }));

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: (strings: TemplateStringsArray) =>
      Promise.resolve(strings.join("").includes("SELECT") ? db.rows : db.expired),
    $executeRaw: (strings: TemplateStringsArray) => {
      db.writes.push(strings.join("|"));
      return Promise.resolve(1);
    },
    trip: {
      update: (args: unknown) => {
        db.tripUpdates.push(args);
        return Promise.resolve({});
      },
      updateMany: (args: unknown) => {
        db.tripUpdateManys.push(args);
        return Promise.resolve({ count: 1 });
      },
    },
  },
}));

vi.mock("@/lib/notify/watch-db", () => ({
  ensureTripWatchTable: () => Promise.resolve(),
}));

vi.mock("@/lib/notify/ntfy", () => ({
  sendNtfy: (msg: NtfyMessage) => {
    sent.messages.push(msg);
    return Promise.resolve({ ok: sent.ok, status: sent.ok ? 200 : 500 });
  },
}));

const { runWatchTick } = await import("@/lib/notify/watch-tick");

/** Eine faellige Ueberwachung, so wie sie aus der Datenbank kaeme. */
function watchRow(over: Record<string, unknown> = {}) {
  return {
    trip_id: "trip-1",
    // Parkhaus Ottensen (Seed): belegt, null von sechs frei.
    evse_id: "DE*SEED*E000003",
    name: "Parkhaus Ottensen",
    lat: 53.553,
    lng: 9.9225,
    // Beim Losfahren war sie frei — genau der Wechsel, der pushen muss.
    status: "available",
    free: 2,
    total: 6,
    diversions: 0,
    dwell_minutes: 480,
    return_trip_km: null,
    resolved_lat: 53.551,
    resolved_lng: 9.9215,
    resolved_name: "Gastwerk Hotel Hamburg",
    ...over,
  };
}

beforeEach(() => {
  db.rows = [];
  db.expired = [];
  db.writes = [];
  db.tripUpdates = [];
  db.tripUpdateManys = [];
  sent.messages = [];
  sent.ok = true;
  process.env.NTFY_TOPIC = "test-topic";
  // Ohne diese Keys ist die Quelle der Seed — deterministisch, kein Netz.
  delete process.env.TOMTOM_API_KEY;
  delete process.env.CHARGER_SOURCE;
});

describe("runWatchTick — der komplette Durchlauf", () => {
  it("belegte Saeule: schickt den Push, schliesst die Ueberwachung, Trip 'diverted'", async () => {
    db.rows = [watchRow()];
    const r = await runWatchTick(new Date("2026-09-08T18:00:00Z"));

    expect(r.ok).toBe(true);
    expect(r.checked).toBe(1);
    expect(r.pushed).toEqual(["trip-1"]);

    expect(sent.messages).toHaveLength(1);
    const msg = sent.messages[0]!;
    expect(msg.topic).toBe("test-topic");
    expect(msg.message).toContain("Parkhaus Ottensen ist belegt");
    expect(msg.message).toContain("Ausweichen auf");
    // Die belegte Saeule darf nicht als eigene Alternative vorgeschlagen werden.
    expect(msg.message).not.toContain("Ausweichen auf Parkhaus Ottensen");

    // Ueberwachung beendet + Trip umgeleitet.
    expect(db.writes.some((w) => w.includes("done_at") && w.includes("diversions"))).toBe(true);
    expect(db.tripUpdates).toHaveLength(1);
    expect(db.tripUpdates[0]).toMatchObject({
      where: { id: "trip-1" },
      data: { status: "diverted" },
    });
  });

  it("freie Saeule: kein Push, nur der Zaehler laeuft weiter", async () => {
    // Schnellladepark Bahrenfeld (Seed): drei von vier frei.
    db.rows = [
      watchRow({ evse_id: "DE*SEED*E000002", name: "Schnellladepark Bahrenfeld", lat: 53.5525, lng: 9.9215, free: 4 }),
    ];
    const r = await runWatchTick(new Date("2026-09-08T18:00:00Z"));

    expect(sent.messages).toHaveLength(0);
    expect(r.pushed).toEqual([]);
    expect(r.checked).toBe(1);
    expect(db.writes.some((w) => w.includes("checks = checks + 1"))).toBe(true);
    expect(db.tripUpdates).toHaveLength(0);
  });

  it("Saeule nicht auffindbar: kein Push (Datenluecke ist kein Belegt-Beweis)", async () => {
    db.rows = [watchRow({ evse_id: "GIBT-ES-NICHT", lat: 0, lng: 0, resolved_lat: 0, resolved_lng: 0 })];
    const r = await runWatchTick(new Date("2026-09-08T18:00:00Z"));

    expect(sent.messages).toHaveLength(0);
    expect(r.pushed).toEqual([]);
  });

  it("bereits umgeleitet: kein zweiter Push", async () => {
    db.rows = [watchRow({ diversions: 1 })];
    await runWatchTick(new Date("2026-09-08T18:00:00Z"));
    expect(sent.messages).toHaveLength(0);
  });

  it("Versand fehlgeschlagen: Vorzustand bleibt stehen, damit der naechste Tick es erneut versucht", async () => {
    sent.ok = false;
    db.rows = [watchRow()];
    const r = await runWatchTick(new Date("2026-09-08T18:00:00Z"));

    expect(sent.messages).toHaveLength(1); // versucht …
    expect(r.pushed).toEqual([]); // … aber nicht angekommen
    // Kein Abschluss, und der Vorzustand ("war frei") wird NICHT ueberschrieben.
    expect(db.writes.some((w) => w.includes("done_at"))).toBe(false);
    expect(db.writes.some((w) => w.includes("status ="))).toBe(false);
    expect(db.tripUpdates).toHaveLength(0);
  });

  it("ohne NTFY_TOPIC laeuft gar nichts — und sagt das auch", async () => {
    delete process.env.NTFY_TOPIC;
    db.rows = [watchRow()];
    const r = await runWatchTick(new Date("2026-09-08T18:00:00Z"));

    expect(r.ok).toBe(false);
    expect(r.skipped).toContain("NTFY_TOPIC");
    expect(sent.messages).toHaveLength(0);
  });

  it("abgelaufenes Fenster: Ueberwachung und Fahrt werden abgeschlossen", async () => {
    db.expired = [{ trip_id: "trip-alt" }];
    const r = await runWatchTick(new Date("2026-09-08T18:00:00Z"));

    expect(r.finished).toContain("trip-alt");
    expect(db.tripUpdateManys).toHaveLength(1);
    expect(db.tripUpdateManys[0]).toMatchObject({ data: { status: "done" } });
  });
});
