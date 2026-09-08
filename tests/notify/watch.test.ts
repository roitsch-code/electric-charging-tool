import { describe, it, expect } from "vitest";
import {
  decideWatch,
  isBlocked,
  nextState,
  probeTarget,
  stateOf,
  type WatchState,
} from "@/lib/notify/watch";
import { buildDiversionMessage, pickAlternative } from "@/lib/notify/message";
import { computeWatchWindow, WATCH_LEAD_MINUTES } from "@/lib/notify/timing";
import { planDestination } from "@/lib/chargers";
import { SeedChargerSource } from "@/lib/chargers/seed";
import type { Charger } from "@/lib/chargers/types";

const free = (n = 2, total = 4): WatchState => ({ status: "available", free: n, total });
const full = (total = 4): WatchState => ({ status: "occupied", free: 0, total });
const unknown: WatchState = { status: "unknown", free: null, total: null };

describe("isBlocked (null Punkte frei?)", () => {
  it("zaehlt die freien Punkte, wenn sie bekannt sind", () => {
    expect(isBlocked(free(2, 4))).toBe(false);
    expect(isBlocked(full())).toBe(true);
    // Widerspruechlicher Fall: Status "available", aber null frei -> belegt.
    expect(isBlocked({ status: "available", free: 0, total: 3 })).toBe(true);
  });

  it("faellt ohne Zaehler auf den Status zurueck", () => {
    expect(isBlocked({ status: "available" })).toBe(false);
    expect(isBlocked({ status: "occupied" })).toBe(true);
    expect(isBlocked({ status: "outoforder" })).toBe(true);
  });

  it("unbekannt bleibt unbekannt (null), nicht 'belegt'", () => {
    expect(isBlocked(unknown)).toBeNull();
    expect(isBlocked(null)).toBeNull();
  });
});

describe("decideWatch — die vereinbarten Regeln", () => {
  it("frei -> belegt: Push", () => {
    const d = decideWatch(free(1, 1), full(1));
    expect(d.push).toBe(true);
    expect(d.reason).toBe("became-occupied");
  });

  it("3/4 frei -> 2/4 frei: KEIN Push", () => {
    const d = decideWatch(free(3, 4), free(2, 4));
    expect(d.push).toBe(false);
    expect(d.reason).toBe("still-free");
  });

  it("1/4 frei -> 0/4 frei: Push", () => {
    const d = decideWatch(free(1, 4), full(4));
    expect(d.push).toBe(true);
    expect(d.reason).toBe("became-occupied");
  });

  it("null frei loest IMMER aus — auch wenn sie vorher schon belegt war", () => {
    const d = decideWatch(full(4), full(4));
    expect(d.push).toBe(true);
    expect(d.reason).toBe("occupied");
  });

  it("null frei loest auch ohne bekannten Vorzustand aus", () => {
    expect(decideWatch(unknown, full(2)).push).toBe(true);
    expect(decideWatch(null, full(2)).push).toBe(true);
  });

  it("defekt zaehlt wie belegt", () => {
    const d = decideWatch(free(2, 2), { status: "outoforder", free: 0, total: 2 });
    expect(d.push).toBe(true);
  });

  it("unbekannter Zustand: kein Push (nichts halluzinieren)", () => {
    const d = decideWatch(free(2, 4), unknown);
    expect(d.push).toBe(false);
    expect(d.reason).toBe("unknown");
  });

  it("Saeule nicht mehr in der Antwort: kein Push (Datenluecke != belegt)", () => {
    const d = decideWatch(free(2, 4), null);
    expect(d.push).toBe(false);
    expect(d.reason).toBe("gone");
  });

  it("nach einem Ausweich-Push kein zweiter (kein Push-Gewitter)", () => {
    const d = decideWatch(free(2, 4), full(4), { alreadyPushed: true });
    expect(d.push).toBe(false);
    expect(d.reason).toBe("already-pushed");
  });

  it("wieder frei geworden: kein Push", () => {
    const d = decideWatch(full(4), free(1, 4));
    expect(d.push).toBe(false);
    expect(d.reason).toBe("still-free");
  });
});

describe("nextState", () => {
  it("uebernimmt einen bekannten Messwert", () => {
    expect(nextState(free(3, 4), free(2, 4)).free).toBe(2);
  });
  it("behaelt den Vorzustand bei unbekannter/fehlender Messung", () => {
    expect(nextState(free(3, 4), unknown).free).toBe(3);
    expect(nextState(free(3, 4), null).free).toBe(3);
  });
});

describe("computeWatchWindow", () => {
  it("beginnt 15 min vor der Ankunft und laeuft mit Gnadenfrist weiter", () => {
    const eta = new Date("2026-09-08T18:00:00Z");
    const w = computeWatchWindow(eta);
    expect(WATCH_LEAD_MINUTES).toBe(15);
    expect(w.from.toISOString()).toBe("2026-09-08T17:45:00.000Z");
    expect(w.until.getTime()).toBeGreaterThan(eta.getTime());
  });
});

// --- Sonde gegen eine Quelle -------------------------------------------------

const TARGET: Charger = {
  evseId: "TT:1",
  name: "Marktplatz",
  lat: 51.2,
  lng: 6.8,
  powerKw: 22,
  connector: "ac",
  status: "occupied",
  freePoints: 0,
  totalPoints: 4,
};

describe("probeTarget", () => {
  it("findet die Saeule ueber die EVSE-ID und liest ihren Zustand", async () => {
    const src = new SeedChargerSource([TARGET]);
    const r = await probeTarget({ evseId: "TT:1", lat: 51.2, lng: 6.8 }, src);
    expect(r?.state).toEqual({ status: "occupied", free: 0, total: 4 });
  });

  it("findet sie auch bei geaenderter ID ueber die Koordinate", async () => {
    const src = new SeedChargerSource([{ ...TARGET, evseId: "TT:neu" }]);
    const r = await probeTarget({ evseId: "TT:1", lat: 51.2, lng: 6.8 }, src);
    expect(r?.charger.evseId).toBe("TT:neu");
  });

  it("liefert null, wenn nur weit entfernte Punkte zurueckkommen", async () => {
    // ~1,1 km noerdlich — dieselbe Suche, aber nicht dieselbe Saeule.
    const src = new SeedChargerSource([{ ...TARGET, evseId: "TT:x", lat: 51.21 }]);
    const r = await probeTarget({ evseId: "TT:1", lat: 51.2, lng: 6.8 }, src);
    expect(r).toBeNull();
  });

  it("stateOf uebersetzt einen Charger ohne Live-Daten zu 'unknown'", () => {
    expect(stateOf({ ...TARGET, status: undefined, freePoints: undefined })).toEqual({
      status: "unknown",
      free: null,
      total: 4,
    });
  });
});

// --- Alternative + Nachricht -------------------------------------------------

const GASTWERK = { lat: 53.551, lng: 9.9215, name: "Gastwerk Hotel Hamburg" };
const INPUT = { dwellMinutes: 480, returnTripKm: null };

describe("pickAlternative", () => {
  it("schliesst die belegte Saeule aus und liefert einen freien Punkt", async () => {
    const plan = await planDestination(GASTWERK, INPUT);
    const target = plan.top[0]!.charger;
    const alt = pickAlternative(plan, target);
    expect(alt).not.toBeNull();
    expect(alt!.charger.evseId).not.toBe(target.evseId);
    expect(alt!.charger.status).not.toBe("outoforder");
    expect(alt!.charger.freePoints).toBeGreaterThan(0);
  });

  it("schliesst auch einen Punkt an derselben Stelle mit anderer ID aus", async () => {
    const plan = await planDestination(GASTWERK, INPUT);
    const target = plan.top[0]!.charger;
    const alt = pickAlternative(plan, { ...target, evseId: "ANDERE-ID" });
    expect(alt!.charger.evseId).not.toBe(target.evseId);
  });

  it("liefert null, wenn es nur die eine Saeule gibt", async () => {
    const plan = await planDestination(
      { lat: 53.2, lng: 7.5, name: "Landgasthof" },
      { dwellMinutes: 180, returnTripKm: null },
    );
    expect(plan.top).toHaveLength(1);
    expect(pickAlternative(plan, plan.top[0]!.charger)).toBeNull();
  });
});

describe("buildDiversionMessage — der vorgelesene Text", () => {
  it("sagt, was los ist, NENNT die Alternative und haengt Deeplinks an", async () => {
    const plan = await planDestination(GASTWERK, INPUT);
    const target = plan.top[0]!.charger;
    const alt = pickAlternative(plan, target)!;
    const msg = buildDiversionMessage(
      "mein-topic",
      { name: target.name, status: "occupied" },
      alt,
      INPUT,
      GASTWERK,
    );

    expect(msg.title).toBe("Ladeplanner");
    expect(/^[\x00-\x7F]*$/.test(msg.title)).toBe(true); // ntfy-Header: ASCII
    expect(msg.message).toContain("ist belegt");
    // Ohne Namen weiss man nicht, wohin man faehrt — Tippen geht waehrend der
    // Fahrt nicht (§ 23 Abs. 1a StVO).
    expect(msg.message).toContain(`Ausweichen auf ${alt.charger.name}`);
    expect(msg.message).toContain("zum Ziel");
    expect(msg.message).toContain("Kilowatt");
    expect(msg.priority).toBe(5);
    expect(msg.actions).toHaveLength(2);
    expect(msg.actions![0]!.url).toContain("google.com/maps/dir");
    expect(msg.actions![1]!.url).toContain("travelmode=walking");
  });

  it("bleibt kurz genug zum Vorlesen (hoechstens 30 Woerter)", async () => {
    const plan = await planDestination(GASTWERK, INPUT);
    const alt = pickAlternative(plan, plan.top[0]!.charger);
    const msg = buildDiversionMessage(
      "t",
      { name: plan.top[0]!.charger.name, status: "occupied" },
      alt,
      INPUT,
      GASTWERK,
    );
    expect(msg.message.split(/\s+/).length).toBeLessThanOrEqual(30);
  });

  it("defekte Saeule heisst 'außer Betrieb', nicht 'belegt'", async () => {
    const plan = await planDestination(GASTWERK, INPUT);
    const alt = pickAlternative(plan, plan.top[0]!.charger);
    const msg = buildDiversionMessage(
      "t",
      { name: "Marktplatz", status: "outoforder" },
      alt,
      INPUT,
      GASTWERK,
    );
    expect(msg.message).toContain("Marktplatz ist außer Betrieb");
    expect(msg.message).not.toContain("belegt");
  });

  it("kein Fuellsatz, wenn die Alternative zum Bedarf passt", async () => {
    const plan = await planDestination(GASTWERK, INPUT);
    const alt = pickAlternative(plan, plan.top[0]!.charger);
    const msg = buildDiversionMessage(
      "t",
      { name: "Marktplatz", status: "occupied" },
      alt,
      INPUT,
      GASTWERK,
    );
    expect(msg.message).not.toContain("Reicht über Nacht");
  });

  it("warnt, wenn nur noch Wechselstrom uebrig ist und DC gebraucht wird", async () => {
    const input = { dwellMinutes: 30, returnTripKm: 300 };
    const plan = await planDestination(GASTWERK, input);
    const acOnly = plan.top.find((r) => r.charger.connector === "ac")!;
    const msg = buildDiversionMessage("t", { name: "Marktplatz", status: "occupied" }, acOnly, input, GASTWERK);
    expect(msg.message).toContain("Nur Wechselstrom");
    expect(msg.message).toContain("für den kurzen Halt zu wenig");
  });

  it("ohne Alternative: ehrliche Ansage statt erfundener Empfehlung", () => {
    const msg = buildDiversionMessage(
      "t",
      { name: "Marktplatz, Emmerich", status: "occupied" },
      null,
      INPUT,
      GASTWERK,
    );
    expect(msg.message).toBe("Ladeplanner: Marktplatz ist belegt. Keine freie Alternative in Gehdistanz.");
    expect(msg.actions).toHaveLength(0);
  });
});
