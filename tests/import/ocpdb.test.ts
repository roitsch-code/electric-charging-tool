import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseOcpdbStatic } from "@/lib/import/ocpdb";

const json = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../fixtures/mobidata/static-sample.json", import.meta.url)),
    "utf-8",
  ),
);

describe("parseOcpdbStatic (echte, getrimmte Daten)", () => {
  const chargers = parseOcpdbStatic(json);

  it("parst die Ladepunkte der Fixture", () => {
    expect(chargers.length).toBeGreaterThanOrEqual(4);
  });

  it("nutzt die BNETZA-EVSE-ID (passend zum Realtime-Feed)", () => {
    for (const c of chargers) {
      expect(c.evseId).toMatch(/^BNETZA\*/);
    }
  });

  it("liest currentType als connector, Leistung in kW, Koordinaten", () => {
    const c = chargers[0]!;
    expect(["ac", "dc"]).toContain(c.connector);
    expect(c.powerKw).toBeGreaterThan(0);
    expect(Number.isFinite(c.lat)).toBe(true);
    expect(Number.isFinite(c.lng)).toBe(true);
    expect(c.source).toBe("ocpdb");
    expect(c.status).toBe("unknown");
  });

  it("erste Fixture ist 11 kW AC (aus dem echten Datensatz)", () => {
    const first = chargers.find((c) => c.evseId === "BNETZA*1002913*1")!;
    expect(first.connector).toBe("ac");
    expect(first.powerKw).toBe(11);
  });

  it("wirft nicht bei leerem Payload", () => {
    expect(parseOcpdbStatic({})).toEqual([]);
  });
});
