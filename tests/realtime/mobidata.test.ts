import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mapDatexStatus, parseMobidataRealtime } from "@/lib/realtime/mobidata";

const json = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../fixtures/mobidata/realtime-sample.json", import.meta.url)),
    "utf-8",
  ),
);

describe("mapDatexStatus", () => {
  it("mappt DATEX-Werte auf interne Status", () => {
    expect(mapDatexStatus("available")).toBe("available");
    expect(mapDatexStatus("charging")).toBe("occupied");
    expect(mapDatexStatus("outOfOrder")).toBe("outoforder");
    expect(mapDatexStatus("inoperative")).toBe("outoforder");
    expect(mapDatexStatus("unknown")).toBe("unknown");
    expect(mapDatexStatus(undefined)).toBe("unknown");
    expect(mapDatexStatus("irgendwas")).toBe("unknown");
  });
});

describe("parseMobidataRealtime (echte, getrimmte Daten)", () => {
  const records = parseMobidataRealtime(json);

  it("liest alle refillPointStatus-Eintraege", () => {
    expect(records.length).toBeGreaterThanOrEqual(5);
  });

  it("liefert eine evseId, Status und Zeitstempel je Eintrag", () => {
    // Reale IDs mischen Schemata: "BNETZA*<id>*<punkt>" und echte OCPI-IDs
    // wie "DE*SHN*E...". Entscheidend ist nur, dass die ID (aus derselben
    // OCPDB-Quelle) zum statischen Bestand passt.
    for (const r of records) {
      expect(r.evseId.length).toBeGreaterThan(0);
      expect(["available", "occupied", "outoforder", "unknown"]).toContain(r.status);
      expect(r.lastUpdated).toBeTruthy();
      expect(r.source).toBe("mobidata-bw");
    }
  });

  it("deckt alle fuenf realen DATEX-Statuswerte ab", () => {
    const statuses = new Set(records.map((r) => r.status));
    expect(statuses.has("available")).toBe(true);
    expect(statuses.has("occupied")).toBe(true); // aus "charging"
    expect(statuses.has("outoforder")).toBe(true); // aus outOfOrder/inoperative
    expect(statuses.has("unknown")).toBe(true);
  });

  it("wirft nicht bei leerem/kaputtem Payload", () => {
    expect(parseMobidataRealtime({})).toEqual([]);
    expect(parseMobidataRealtime(null)).toEqual([]);
  });
});
