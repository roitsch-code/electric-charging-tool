import type { ChargerSource } from "./types";
import { seedSource } from "./seed";
import { PostgisChargerSource } from "./postgis-source";
import { TomTomChargerSource } from "./tomtom-source";

/**
 * Waehlt die Ladepunkt-Quelle:
 *   1. TOMTOM_API_KEY gesetzt -> TomTom (DE-weit, echtzeit: Position + Live-
 *      Belegung + Leistung/Steckertyp in einem Aufruf). Das ist die Quelle,
 *      die SWD Düsseldorf korrekt und live liefert.
 *   2. CHARGER_SOURCE=postgis -> PostGIS-Umkreissuche (importierter Bestand).
 *   3. sonst der In-Memory-Seed (Tests/Demo ohne Netz).
 *
 * Nur die Next-Runtime laedt dieses Modul (ueber die API-Route bzw. /plan).
 */
export function getChargerSource(): ChargerSource {
  if (process.env.TOMTOM_API_KEY) {
    return new TomTomChargerSource(process.env.TOMTOM_API_KEY);
  }
  if (process.env.CHARGER_SOURCE === "postgis") {
    return new PostgisChargerSource();
  }
  return seedSource;
}
