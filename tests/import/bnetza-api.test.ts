import { describe, it, expect } from "vitest";
import { parseBnetzaApi } from "@/lib/import/bnetza-api";

// Kleine, konsistente Fixtures fuer das 3-Tabellen-Join (semikolon-getrennt).
const ladestationCsv = [
  "ladestation_id;betreiber;betreiber_anzeigename;strasse;hausnummer;plz;ort;laengengrad;breitengrad;betriebsstatus",
  "1000;EnBW AG;EnBW mobility+;Hauptstr.;1;79098;Freiburg;7.8494;47.9959;In Betrieb",
  "2000;Stadtwerke;Stadtwerke Musterstadt;Ring;9;10115;Berlin;13.4049;52.5200;Außer Betrieb",
  "3000;Ohne Koordinaten;;Weg;2;10000;Nirgendwo;;;In Betrieb",
].join("\n");

const ladepunktCsv = [
  "ladepunkt_id;ladepunkt_hk;ladestation_id;evse_id;ladepunkt_nennleistung;datenstand",
  "1000_LP1;hkAAA;1000;DE*ABC*E1;2;2026-01-12",
  "1000_LP2;hkBBB;1000;Unknown;3;2026-01-12",
  "2000_LP1;hkCCC;2000;Unknown;2;2026-01-12",
  "3000_LP1;hkDDD;3000;Unknown;2;2026-01-12",
].join("\n");

const steckerCsv = [
  "stecker_id;ladepunkt_hk;max_ladeleistung_stecker;stecker_ac_schucko;stecker_ac_typ2_steckdose;stecker_ac_type2_kupplung;stecker_dc_kupplung;stecker_dc_ccs;stecker_dc_chademo;stecker_ac_type1_steckdose;stecker_dc_tesla_kupplung;stecker_ac_cee_3;stecker_ac_cee_5;stecker_kabellos_induktiv;datenstand",
  // hkAAA: DC CCS 300 kW
  "1000_LP1_ST1;hkAAA;300;f;f;f;f;t;f;f;f;f;f;f;2026-01-12",
  // hkBBB: AC Typ2 22 kW (zwei Stecker, max 22)
  "1000_LP2_ST1;hkBBB;11;f;t;f;f;f;f;f;f;f;f;f;2026-01-12",
  "1000_LP2_ST2;hkBBB;22;f;f;t;f;f;f;f;f;f;f;f;2026-01-12",
  // hkCCC: AC 11 kW
  "2000_LP1_ST1;hkCCC;11;f;t;f;f;f;f;f;f;f;f;f;2026-01-12",
].join("\n");

describe("parseBnetzaApi (3-Tabellen-Join)", () => {
  const chargers = parseBnetzaApi({ ladestationCsv, ladepunktCsv, steckerCsv });

  it("erzeugt einen Charger je Ladepunkt mit vorhandener Station", () => {
    // 3000_LP1 hat keine Koordinaten -> uebersprungen. Also 3 statt 4.
    expect(chargers).toHaveLength(3);
    expect(chargers.find((c) => c.evseId === "3000_LP1")).toBeUndefined();
  });

  it("joint Koordinaten/Betreiber/Adresse aus der Ladestation", () => {
    const c = chargers.find((c) => c.evseId === "1000_LP1")!;
    expect(c.lat).toBeCloseTo(47.9959, 4);
    expect(c.lng).toBeCloseTo(7.8494, 4);
    expect(c.operator).toBe("EnBW mobility+");
    expect(c.address).toBe("Hauptstr. 1, 79098 Freiburg");
  });

  it("leitet DC aus den Stecker-Flags ab und nimmt die max. Leistung", () => {
    const dc = chargers.find((c) => c.evseId === "1000_LP1")!;
    expect(dc.connector).toBe("dc");
    expect(dc.powerKw).toBe(300);
    expect(dc.connectorType).toContain("CCS");

    const ac = chargers.find((c) => c.evseId === "1000_LP2")!;
    expect(ac.connector).toBe("ac");
    expect(ac.powerKw).toBe(22); // max(11, 22)
  });

  it("uebernimmt Betriebsstatus 'Außer Betrieb' als outoforder, sonst unknown", () => {
    expect(chargers.find((c) => c.evseId === "2000_LP1")!.status).toBe("outoforder");
    expect(chargers.find((c) => c.evseId === "1000_LP1")!.status).toBe("unknown");
  });

  it("nutzt die stabile ladepunkt_id als evseId und source bnetza-api", () => {
    expect(chargers.every((c) => c.source === "bnetza-api")).toBe(true);
    expect(chargers.map((c) => c.evseId)).toContain("1000_LP2");
  });
});
