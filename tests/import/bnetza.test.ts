import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseBnetzaCsv, splitCsvLine } from "@/lib/import/bnetza";

const csv = readFileSync(
  fileURLToPath(new URL("../fixtures/import/bnetza-sample.csv", import.meta.url)),
  "utf-8",
);

describe("splitCsvLine", () => {
  it("respektiert Anfuehrungszeichen mit Komma im Feld", () => {
    const cols = splitCsvLine('a;"b, c";d');
    expect(cols).toEqual(["a", "b, c", "d"]);
  });
});

describe("parseBnetzaCsv", () => {
  const chargers = parseBnetzaCsv(csv);

  it("ueberspringt Vorspann und Leerzeilen, parst vier Ladepunkte", () => {
    expect(chargers).toHaveLength(4);
  });

  it("parst deutsche Dezimalkoordinaten", () => {
    const aral = chargers.find((c) => c.operator?.includes("Aral"))!;
    expect(aral.lat).toBeCloseTo(53.5525, 4);
    expect(aral.lng).toBeCloseTo(9.9215, 4);
  });

  it("leitet DC aus 'Schnellladeeinrichtung' ab, AC aus 'Normalladeeinrichtung'", () => {
    const aral = chargers.find((c) => c.operator?.includes("Aral"))!;
    const lidl = chargers.find((c) => c.operator?.includes("Lidl"))!;
    expect(aral.connector).toBe("dc");
    expect(aral.powerKw).toBe(150);
    expect(lidl.connector).toBe("ac");
    expect(lidl.powerKw).toBe(11);
  });

  it("baut eine lesbare Adresse und eine stabile EVSE-ID", () => {
    const lidl = chargers.find((c) => c.operator?.includes("Lidl"))!;
    expect(lidl.address).toBe("Bahrenfelder Chaussee 10, 22761 Hamburg");
    expect(lidl.evseId).toMatch(/^DE\*BNA\*[0-9a-f]{8}$/);
    // Determinismus: erneutes Parsen liefert dieselbe ID.
    expect(parseBnetzaCsv(csv).find((c) => c.operator?.includes("Lidl"))!.evseId).toBe(
      lidl.evseId,
    );
  });

  it("setzt Quelle bnetza und Status unknown (keine Realtime-Daten)", () => {
    expect(chargers.every((c) => c.source === "bnetza")).toBe(true);
    expect(chargers.every((c) => c.status === "unknown")).toBe(true);
  });
});
