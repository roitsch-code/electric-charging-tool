import { describe, it, expect } from "vitest";
import { parseAfirStatic, buildAfirSnapshots, aggregateAfirStations } from "@/lib/realtime/datex-afir-static";
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

describe("parseAfirStatic (XML, Smartlab/ladenetz)", () => {
  const XML = `<?xml version="1.0"?>
<ns2:messageContainer xmlns:ns2="http://datex2.eu/schema/3/messageContainer">
 <payload publicationTime="ignored">
  <publicationTime>2026-09-07T01:30:07Z</publicationTime>
  <energyInfrastructureTable id="DEAHF">
   <energyInfrastructureSite id="S1">
    <locationReference type="ns9:PointLocation">
     <coordinatesForDisplay><latitude>51.230757</latitude><longitude>6.810093</longitude></coordinatesForDisplay>
    </locationReference>
    <operator><name><values><value lang="en">DEACW</value></values></name></operator>
    <energyInfrastructureStation id="ST1">
     <refillPoint id="P1" type="ns11:ElectricChargingPoint">
      <externalIdentifier>DE*SWD*E1</externalIdentifier>
      <availableChargingPower>300000</availableChargingPower>
      <connector><connectorType>iec62196T2Combo</connectorType><chargingMode>mode4DC</chargingMode><maxPowerAtSocket>300000</maxPowerAtSocket></connector>
      <locationReference><_locationReferenceExtension><facilityLocation><address>
        <postcode>40235</postcode>
        <city><values><value lang="de">Düsseldorf</value></values></city>
        <addressLine order="1"><type>street</type><text><values><value lang="de">Ackerstraße</value></values></text></addressLine>
        <addressLine order="2"><type>houseNumber</type><text><values><value lang="de">203</value></values></text></addressLine>
      </address></facilityLocation></_locationReferenceExtension></locationReference>
     </refillPoint>
     <refillPoint id="P2" type="ns11:ElectricChargingPoint">
      <externalIdentifier>DE*SWD*E2</externalIdentifier>
      <connector><connectorType>iec62196T2Combo</connectorType><chargingMode>mode4DC</chargingMode><maxPowerAtSocket>300000</maxPowerAtSocket></connector>
     </refillPoint>
    </energyInfrastructureStation>
   </energyInfrastructureSite>
  </energyInfrastructureTable>
 </payload>
</ns2:messageContainer>`;

  it("parst XML automatisch (Namespaces, Elementstruktur)", () => {
    const r = parseAfirStatic(XML);
    expect(r.points).toHaveLength(2);
    const p = r.points[0]!;
    expect(p.lat).toBeCloseTo(51.230757, 5);
    expect(p.lng).toBeCloseTo(6.810093, 5);
    expect(p.connector).toBe("dc"); // mode4DC / Combo
    expect(p.powerKw).toBe(300); // 300000 W
    expect(p.evseId).toBe("DE*SWD*E1");
    expect(p.pointId).toBe("P1");
    expect(p.name).toBe("Ackerstraße 203, Düsseldorf");
  });

  it("aggregiert die XML-Punkte zu einer Station mit Zähler", () => {
    const stations = aggregateAfirStations(parseAfirStatic(XML).points);
    expect(stations).toHaveLength(1);
    expect(stations[0]!.totalPoints).toBe(2);
    expect(stations[0]!.connector).toBe("dc");
    expect(stations[0]!.powerKw).toBe(300);
    expect(stations[0]!.name).toBe("Ackerstraße 203, Düsseldorf");
  });
});

describe("aggregateAfirStations", () => {
  it("aggregiert Punkte je Standort zu Stationen (Anzahl, max. Leistung, DC gewinnt)", () => {
    const stations = aggregateAfirStations([
      { pointId: "a1", evseId: "E1", lat: 51.2308, lng: 6.8101, connector: "dc", powerKw: 150, operator: "SWD", name: "Ackerstr." },
      { pointId: "a2", evseId: "E2", lat: 51.2308, lng: 6.8101, connector: "ac", powerKw: 22, operator: "SWD", name: "Ackerstr." },
      { pointId: "b1", evseId: "E3", lat: 51.2312, lng: 6.8114, connector: "ac", powerKw: 22, operator: "SWD", name: "Degerstr." },
    ]);
    expect(stations).toHaveLength(2);
    const acker = stations.find((s) => s.evseId === "AFIR:51.230800,6.810100")!;
    expect(acker.totalPoints).toBe(2);
    expect(acker.connector).toBe("dc"); // gemischt -> DC gewinnt
    expect(acker.powerKw).toBe(150); // max
    expect(acker.source).toBe("afir");
    const deger = stations.find((s) => s.evseId === "AFIR:51.231200,6.811400")!;
    expect(deger.totalPoints).toBe(1);
    expect(deger.connector).toBe("ac");
  });
});
