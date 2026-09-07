import type { ChargerSource } from "./types";
import { seedSource } from "./seed";
import { PostgisChargerSource } from "./postgis-source";
import { CuratedChargerSource, DUS_HOME_CHARGERS } from "./curated-dus";

/**
 * Waehlt die Ladepunkt-Quelle. Standard ist der Seed (M3). Erst wenn
 * CHARGER_SOURCE=postgis gesetzt ist (nachdem die DB gefuellt wurde),
 * schaltet die App auf die PostGIS-Umkreissuche (M2) um.
 *
 * Nur die Next-Runtime laedt dieses Modul (ueber die API-Route); die Tests
 * importieren es nicht, deshalb ist der statische Prisma-Import hier ok.
 */
export function getChargerSource(): ChargerSource {
  const base: ChargerSource =
    process.env.CHARGER_SOURCE === "postgis" ? new PostgisChargerSource() : seedSource;
  // Verifizierte Zuhause-Daten (Düsseldorf) haben Vorrang; sonst normale Quelle.
  return new CuratedChargerSource(DUS_HOME_CHARGERS, base);
}
