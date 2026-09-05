import { describe, it, expect } from "vitest";
import { parseAfirStatic, buildAfirSnapshots } from "@/lib/realtime/datex-afir-static";
import { parseAfirDynamic } from "@/lib/realtime/datex-afir";

// Nachbau der echten Static-Struktur (2026-09, verifiziert an Mobilithek-Daten).
const STATIC = {
  payload: {
    aegiEnergyInfrastructureTablePublication: {
      publicationTime: "2026-09-05T10:21:33Z",
      headerInformation: { informationStatus: { value: "test" } },
      energyInfrastructureTable: [
        {
          idG: "table-1",
          energyInfrastructureSite: [
            {
              idG: "site-1",
              locationReference: {
                locAreaLocation: {
                  coordinatesForDisplay: { latitude: 53.24922, longitude: 10.40493 },
                  locLocationExtensionG: {
                    FacilityLocation: {
                      address: {
                        city: { values: [{ lang: "de", value: "Bleckede" }] },
                        addressLine: [
                          { order: 0, type: { value: "street" }, text: { values: [{ lang: "de", value: "Bahnhofstr. 1" }] } },
                        ],
                      },
                    },
                  },
                },
              },
              operator: { afacAnOrganisation: { name: { values: [{ lang: "de", value: "E-Flux by Road" }] } } },
              energyInfrastructureStation: [
                {
                  idG: "station-1",
                  refillPoint: [
                    {
                      aegiElectricChargingPoint: {
                        idG: "fb27637c-d7a2-57fb-a180-dbbcee0c33b9",
                        externalIdentifier: [
                          { identifier: "DE*EFL*EV8823514*C1", typeOfIdentifier: { value: "extendedG", extendedValueG: "evseId" } },
                        ],
                        currentType: { value: "ac" },
                        numberOfConnectors: 1,
                        connector: [{ connectorType: { value: "iec62196T2" }, maxPowerAtSocket: 22080 }],
                      },
                    },
                    {
                      aegiElectricChargingPoint: {
                        idG: "point-2",
                        externalIdentifier: [
                          { identifier: "DE*EFL*EV8823514*C2", typeOfIdentifier: { extendedValueG: "evseId" } },
                        ],
                        currentType: { value: "dc" },
                        connector: [{ maxPowerAtSocket: 150000 }],
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
};

describe("parseAfirStatic", () => {
  it("liest Ladepunkte mit Koordinaten, EVSE-ID, Leistung", () => {
    const r = parseAfirStatic(STATIC as unknown as Record<string, unknown>);
    expect(r.informationStatus).toBe("test");
    expect(r.points).toHaveLength(2);

    const p1 = r.points.find((p) => p.pointId === "fb27637c-d7a2-57fb-a180-dbbcee0c33b9")!;
    expect(p1.lat).toBeCloseTo(53.24922);
    expect(p1.lng).toBeCloseTo(10.40493);
    expect(p1.evseId).toBe("DE*EFL*EV8823514*C1");
    expect(p1.connector).toBe("ac");
    expect(p1.powerKw).toBe(22); // 22080 W -> 22 kW
    expect(p1.operator).toBe("E-Flux by Road");
    expect(p1.name).toBe("Bahnhofstr. 1, Bleckede");

    const p2 = r.points.find((p) => p.pointId === "point-2")!;
    expect(p2.connector).toBe("dc");
    expect(p2.powerKw).toBe(150);
  });
});

describe("buildAfirSnapshots (Join Static + Dynamic)", () => {
  it("aggregiert je Standort zu X von Y frei", () => {
    const staticR = parseAfirStatic(STATIC as unknown as Record<string, unknown>);
    // Dynamic: Punkt 1 frei, Punkt 2 belegt (gleicher Standort)
    const dynamic = parseAfirDynamic({
      messageContainer: {
        payload: [
          {
            aegiEnergyInfrastructureStatusPublication: {
              publicationTime: "2026-09-05T10:47:31Z",
              energyInfrastructureSiteStatus: [
                {
                  energyInfrastructureStationStatus: [
                    {
                      refillPointStatus: [
                        { aegiElectricChargingPointStatus: { reference: { idG: "fb27637c-d7a2-57fb-a180-dbbcee0c33b9" }, status: { value: "available" } } },
                        { aegiElectricChargingPointStatus: { reference: { idG: "point-2" }, status: { value: "occupied" } } },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    } as unknown as Record<string, unknown>);

    const snaps = buildAfirSnapshots(staticR.points, dynamic);
    expect(snaps).toHaveLength(1); // beide Punkte am selben Standort
    expect(snaps[0]!.lat).toBeCloseTo(53.24922);
    expect(snaps[0]!.available).toBe(1);
    expect(snaps[0]!.total).toBe(2);
    expect(snaps[0]!.status).toBe("available");
    expect(snaps[0]!.fetchedAt).toBe("2026-09-05T10:47:31Z");
    expect(snaps[0]!.name).toBe("Bahnhofstr. 1, Bleckede");
  });

  it("ignoriert Status ohne bekannten Standort", () => {
    const dynamic = parseAfirDynamic({
      messageContainer: {
        payload: [
          {
            aegiEnergyInfrastructureStatusPublication: {
              energyInfrastructureSiteStatus: [
                { energyInfrastructureStationStatus: [{ refillPointStatus: [
                  { aegiElectricChargingPointStatus: { reference: { idG: "unbekannt" }, status: { value: "available" } } },
                ] }] },
              ],
            },
          },
        ],
      },
    } as unknown as Record<string, unknown>);
    expect(buildAfirSnapshots([], dynamic)).toEqual([]);
  });
});
