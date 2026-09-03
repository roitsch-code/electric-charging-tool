import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mapOcmPois, type OcmPoi } from "@/lib/import/ocm";

const pois = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../fixtures/import/ocm-sample.json", import.meta.url)),
    "utf-8",
  ),
) as OcmPoi[];

describe("mapOcmPois", () => {
  const chargers = mapOcmPois(pois);

  it("ueberspringt POIs ohne Koordinaten", () => {
    // 4 POIs, einer ohne Koordinaten -> 3 gemappt.
    expect(chargers).toHaveLength(3);
  });

  it("nimmt die hoechste Leistung ueber alle Connections", () => {
    const autohof = chargers.find((c) => c.evseId === "OCM-234567")!;
    expect(autohof.powerKw).toBe(300);
    expect(autohof.connector).toBe("dc");
  });

  it("erkennt AC korrekt", () => {
    const rathaus = chargers.find((c) => c.evseId === "OCM-123456")!;
    expect(rathaus.connector).toBe("ac");
    expect(rathaus.powerKw).toBe(22);
  });

  it("mappt IsOperational=false auf outoforder, sonst unknown", () => {
    const defekt = chargers.find((c) => c.evseId === "OCM-456789")!;
    expect(defekt.status).toBe("outoforder");
    const rathaus = chargers.find((c) => c.evseId === "OCM-123456")!;
    expect(rathaus.status).toBe("unknown");
  });

  it("setzt Quelle ocm und eine OCM-EVSE-ID", () => {
    expect(chargers.every((c) => c.source === "ocm")).toBe(true);
    expect(chargers.every((c) => c.evseId.startsWith("OCM-"))).toBe(true);
  });
});
