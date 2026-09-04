import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { detectDelimiter, parseBnetzaCsv, splitCsvLine } from "@/lib/import/bnetza";

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

describe("detectDelimiter", () => {
  it("erkennt Semikolon (offizielles Format)", () => {
    expect(detectDelimiter("Betreiber;Straße;Breitengrad;Längengrad")).toBe(";");
  });
  it("erkennt Komma (Open-Data-Spiegel)", () => {
    expect(detectDelimiter("Betreiber,Straße,Breitengrad,Längengrad")).toBe(",");
  });
});

describe("parseBnetzaCsv — komma-getrenntes Format mit Dezimalpunkt", () => {
  // Reales Format des Schleswig-Holstein-Open-Data-Spiegels: Komma-Trenner,
  // Dezimalpunkt, keine Vorspann-Zeilen.
  const csv = [
    "Betreiber,Straße,Hausnummer,Postleitzahl,Ort,Breitengrad,Längengrad,Anschlussleistung,Art der Ladeeinrichtung",
    "EnBW mobility+,Emil-von-Behring-Str.,3,22541,Brunsbüttel,53.90075,9.12262,150,Schnellladeeinrichtung",
    "Stadtwerke Brunsbüttel,Koogstraße,61,25541,Brunsbüttel,53.896652,9.13945,44,Normalladeeinrichtung",
  ].join("\n");
  const chargers = parseBnetzaCsv(csv);

  it("parst beide Zeilen trotz Komma-Trenner", () => {
    expect(chargers).toHaveLength(2);
  });
  it("liest Dezimalpunkt-Koordinaten korrekt", () => {
    expect(chargers[0]!.lat).toBeCloseTo(53.90075, 5);
    expect(chargers[0]!.lng).toBeCloseTo(9.12262, 5);
  });
  it("leitet DC/AC weiterhin richtig ab", () => {
    expect(chargers[0]!.connector).toBe("dc"); // 150 kW Schnellladeeinrichtung
    expect(chargers[1]!.connector).toBe("ac"); // 44 kW Normalladeeinrichtung
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
