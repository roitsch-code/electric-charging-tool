import type { ChargerSource } from "./types";
import { seedSource } from "./seed";
import { PostgisChargerSource } from "./postgis-source";

/**
 * Waehlt die Ladepunkt-Quelle. Standard ist der Seed (M3). Erst wenn
 * CHARGER_SOURCE=postgis gesetzt ist (nachdem die DB gefuellt wurde),
 * schaltet die App auf die PostGIS-Umkreissuche (M2) um.
 *
 * Nur die Next-Runtime laedt dieses Modul (ueber die API-Route); die Tests
 * importieren es nicht, deshalb ist der statische Prisma-Import hier ok.
 */
export function getChargerSource(): ChargerSource {
  if (process.env.CHARGER_SOURCE === "postgis") {
    return new PostgisChargerSource();
  }
  return seedSource;
}
