import type { Coordinates } from "@/lib/resolver/types";
import { haversineMeters } from "./geo";
import type { Charger, ChargerSource } from "./types";

/**
 * Verifizierter, kuratierter Datensatz für den Zuhause-Kontext (Düsseldorf,
 * Ackerstraße). Vom Nutzer bestätigte SWD-Standorte, Positionen per
 * Geocoding/OSM-Hausnummern gegengeprüft (Distanzen stimmen auf ±wenige m):
 *   - Ackerstraße 203  ~79 m   (DC-Schnelllader, max. 1 Std)
 *   - Hermannstraße 22 ~103 m  (2×22 kW AC, im System als Hermannstr. 22)
 *   - Degerstraße 18   ~189 m  (4×22 kW AC, max. 4 Std)
 *
 * Standzeit-Regel Düsseldorf/SWD (recherchiert): Zeichen 314, Parkscheibe,
 * tagsüber Höchstparkdauer 1 Std (DC) bzw. 4 Std (AC); über Nacht i. d. R.
 * frei (SWD-Blockiergebühr entfällt 21–08 Uhr).
 *
 * Live-Belegung (frei/gesamt) folgt, sobald Mobilithek AFIR den Testbetrieb
 * verlässt; bis dahin ist nur die Anzahl der Ladepunkte bekannt.
 */
export const DUS_HOME_CHARGERS: Charger[] = [
  {
    evseId: "DE*SWD*CUR*ACK203DC",
    name: "Schnelllader Ackerstraße",
    lat: 51.230757,
    lng: 6.810093,
    operator: "Stadtwerke Düsseldorf",
    powerKw: 150, // Schnelllader; exakte Leistung noch zu bestaetigen
    connector: "dc",
    address: "Ackerstraße 203, 40235 Düsseldorf",
    source: "curated-dus",
    totalPoints: 2,
    standzeitLabel: "Nachts frei · tagsüber max. 1 Std",
    standzeitVerdict: "free",
  },
  {
    evseId: "DE*SWD*CUR*HERM22AC",
    name: "Ladesäulen Hermannstraße",
    lat: 51.230316,
    lng: 6.807664,
    operator: "Stadtwerke Düsseldorf",
    powerKw: 22,
    connector: "ac",
    address: "Hermannstraße 22, 40233 Düsseldorf",
    source: "curated-dus",
    totalPoints: 2,
    standzeitLabel: "Nachts frei · tagsüber max. 4 Std",
    standzeitVerdict: "free",
  },
  {
    evseId: "DE*SWD*CUR*DEG18AC",
    name: "Ladesäulen Degerstraße",
    lat: 51.231236,
    lng: 6.811482,
    operator: "Stadtwerke Düsseldorf",
    powerKw: 22,
    connector: "ac",
    address: "Degerstraße 18, 40235 Düsseldorf",
    source: "curated-dus",
    totalPoints: 4,
    standzeitLabel: "Nachts frei · tagsüber max. 4 Std",
    standzeitVerdict: "free",
  },
];

/**
 * Verifizierte Daten haben Vorrang: Liegen kuratierte Punkte im Suchradius,
 * werden NUR diese zurückgegeben (kein Vermischen mit dem fehlerhaften Import).
 * Sonst übernimmt die normale Quelle (Seed bzw. PostGIS).
 */
export class CuratedChargerSource implements ChargerSource {
  constructor(
    private readonly curated: Charger[],
    private readonly fallback: ChargerSource,
  ) {}

  async within(center: Coordinates, radiusM: number): Promise<Charger[]> {
    const near = this.curated.filter(
      (c) => haversineMeters(center, { lat: c.lat, lng: c.lng }) <= radiusM,
    );
    if (near.length > 0) return near;
    return this.fallback.within(center, radiusM);
  }
}
