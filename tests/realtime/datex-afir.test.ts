import { describe, it, expect } from "vitest";
import { parseAfirDynamic, mapAfirStatus } from "@/lib/realtime/datex-afir";

// Nachbau der echten Mobilithek-AFIR-Dynamic-Struktur (2026-09, verifiziert).
const SAMPLE = {
  messageContainer: {
    payload: [
      {
        modelBaseVersionG: "3",
        profileNameG: "AFIR Energy Infrastructure",
        aegiEnergyInfrastructureStatusPublication: {
          lang: "de",
          publicationTime: "2026-09-05T10:47:31Z",
          publicationCreator: { country: "DE", nationalIdentifier: "DE-NAP-Road" },
          headerInformation: {
            confidentiality: { value: "noRestriction" },
            informationStatus: { value: "test" },
          },
          energyInfrastructureSiteStatus: [
            {
              reference: { targetClass: "FacilityObject", idG: "site-1", versionG: "1" },
              lastUpdated: "2026-09-05T10:47:31Z",
              energyInfrastructureStationStatus: [
                {
                  reference: { targetClass: "FacilityObject", idG: "station-1", versionG: "1" },
                  lastUpdated: "2026-09-05T10:47:31Z",
                  refillPointStatus: [
                    {
                      aegiElectricChargingPointStatus: {
                        reference: { targetClass: "FacilityObject", idG: "cc678178-d1ae-573e-aa71-90d055ec976f", versionG: "1788605251" },
                        lastUpdated: "2026-09-05T10:47:31Z",
                        status: { value: "available" },
                      },
                    },
                    {
                      aegiElectricChargingPointStatus: {
                        reference: { targetClass: "FacilityObject", idG: "aa111111-0000-0000-0000-000000000000", versionG: "1788605251" },
                        lastUpdated: "2026-09-05T10:47:31Z",
                        status: { value: "occupied" },
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
  },
};

describe("mapAfirStatus", () => {
  it("normalisiert DATEX-Statuswerte", () => {
    expect(mapAfirStatus("available")).toBe("available");
    expect(mapAfirStatus("occupied")).toBe("occupied");
    expect(mapAfirStatus("reserved")).toBe("occupied");
    expect(mapAfirStatus("outOfService")).toBe("outoforder");
    expect(mapAfirStatus("faulted")).toBe("outoforder");
    expect(mapAfirStatus("weirdvalue")).toBe("unknown");
    expect(mapAfirStatus(undefined)).toBe("unknown");
  });
});

describe("parseAfirDynamic", () => {
  it("liest Ladepunkt-Status aus dem echten Struktur-Sample", () => {
    const r = parseAfirDynamic(SAMPLE as unknown as Record<string, unknown>);
    expect(r.publicationTime).toBe("2026-09-05T10:47:31Z");
    expect(r.informationStatus).toBe("test");
    expect(r.points).toHaveLength(2);
    expect(r.points[0]).toEqual({
      pointId: "cc678178-d1ae-573e-aa71-90d055ec976f",
      status: "available",
      rawStatus: "available",
      lastUpdated: "2026-09-05T10:47:31Z",
    });
    expect(r.points[1]!.status).toBe("occupied");
  });

  it("akzeptiert auch den JSON-String", () => {
    const r = parseAfirDynamic(JSON.stringify(SAMPLE));
    expect(r.points).toHaveLength(2);
  });

  it("liefert leere Liste bei Muell statt zu werfen", () => {
    expect(parseAfirDynamic("kein json").points).toEqual([]);
    expect(parseAfirDynamic({}).points).toEqual([]);
  });
});
