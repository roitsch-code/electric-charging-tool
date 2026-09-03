import type { Coordinates } from "@/lib/resolver/types";
import { haversineMeters } from "./geo";
import type { Charger, ChargerSource } from "./types";

/**
 * Seed-Ladepunkte fuer M3 (kein DB, kein Import). Zwei Cluster:
 *   1. Rund um "Gastwerk Hotel Hamburg" — dichtes Angebot, ein Punkt am Ziel.
 *   2. Laendlich (Emsland) — nichts in 500/1000 m, ein Punkt bei ~1,5 km,
 *      testet die Radius-Erweiterung (Konzept §8, Schritt 2).
 *
 * Realtime-Zeitstempel bewusst dynamisch (now - n min), damit die Demo
 * "lebt". In M4 ersetzt der MobiData-BW-Poller diese Werte.
 */
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export const SEED_CHARGERS: Charger[] = [
  // --- Cluster 1: Gastwerk Hotel Hamburg (~53.5510, 9.9215) ---
  {
    evseId: "DE*SEED*E000001",
    name: "Gastwerk Hotel Tiefgarage",
    lat: 53.5511,
    lng: 9.9215,
    operator: "Hotel",
    powerKw: 11,
    connector: "ac",
    address: "Beim Alten Gaswerk 3, Hamburg",
    atDestination: true,
    status: "available",
    statusUpdatedAt: minutesAgo(2),
  },
  {
    evseId: "DE*SEED*E000002",
    name: "Schnellladepark Bahrenfeld",
    lat: 53.5525,
    lng: 9.9215,
    operator: "Aral pulse",
    powerKw: 150,
    connector: "dc",
    address: "Gaswerkstrasse, Hamburg",
    status: "available",
    statusUpdatedAt: minutesAgo(1),
  },
  {
    evseId: "DE*SEED*E000003",
    name: "Parkhaus Ottensen",
    lat: 53.553,
    lng: 9.9225,
    operator: "EnBW",
    powerKw: 22,
    connector: "ac",
    address: "Ottenser Hauptstrasse, Hamburg",
    status: "occupied",
    statusUpdatedAt: minutesAgo(3),
  },
  {
    evseId: "DE*SEED*E000004",
    name: "HPC Terminal West",
    lat: 53.548,
    lng: 9.9215,
    operator: "IONITY",
    powerKw: 300,
    connector: "dc",
    address: "Ruhrstrasse, Hamburg",
    // Kein Status/Zeitstempel: "unbekannt" (Konzept §5.1).
  },
  {
    evseId: "DE*SEED*E000005",
    name: "Supermarkt-Parkplatz",
    lat: 53.5545,
    lng: 9.919,
    operator: "Lidl",
    powerKw: 11,
    connector: "ac",
    address: "Bahrenfelder Chaussee, Hamburg",
    status: "available",
    statusUpdatedAt: minutesAgo(6),
  },
  {
    evseId: "DE*SEED*E000006",
    name: "Tankstelle Nord",
    lat: 53.547,
    lng: 9.924,
    operator: "Shell Recharge",
    powerKw: 50,
    connector: "dc",
    address: "Stresemannstrasse, Hamburg",
    status: "outoforder",
    statusUpdatedAt: minutesAgo(12),
  },

  // --- Cluster 2: laendlich (~53.2000, 7.5000), nur ein Punkt bei ~1,5 km ---
  {
    evseId: "DE*SEED*E000101",
    name: "Landgasthof Ladepunkt",
    lat: 53.2135,
    lng: 7.5,
    operator: "Gemeindewerke",
    powerKw: 22,
    connector: "ac",
    address: "Dorfstrasse, Emsland",
    status: "available",
    statusUpdatedAt: minutesAgo(20),
  },
];

/** In-Memory-Quelle. Gleiche Signatur wie die spaetere PostGIS-Suche (M2). */
export class SeedChargerSource implements ChargerSource {
  constructor(private readonly chargers: Charger[] = SEED_CHARGERS) {}

  async within(center: Coordinates, radiusM: number): Promise<Charger[]> {
    return this.chargers.filter(
      (c) => haversineMeters(center, { lat: c.lat, lng: c.lng }) <= radiusM,
    );
  }
}

export const seedSource = new SeedChargerSource();
