import { prisma } from "@/lib/db";

/**
 * Tabelle `trip_watch` (Überwachung der angefahrenen Säule) selbst anlegen —
 * gleiches Muster wie `city_rules`: idempotent, prozessweit gecacht, kein
 * Prisma-Migrationslauf auf dem Server nötig (Auto-Deploy bleibt zero-touch).
 * Spaltenlayout = prisma/sql/trips.sql / schema.prisma (TripWatch).
 */
let tableReady: Promise<void> | null = null;

export function ensureTripWatchTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "trip_watch" (
          "trip_id"      TEXT NOT NULL,
          "evse_id"      TEXT NOT NULL,
          "name"         TEXT NOT NULL,
          "lat"          DOUBLE PRECISION NOT NULL,
          "lng"          DOUBLE PRECISION NOT NULL,
          "status"       TEXT NOT NULL DEFAULT 'unknown',
          "free"         INTEGER,
          "total"        INTEGER,
          "watch_from"   TIMESTAMP(3) NOT NULL,
          "watch_until"  TIMESTAMP(3) NOT NULL,
          "checked_at"   TIMESTAMP(3),
          "checks"       INTEGER NOT NULL DEFAULT 0,
          "diversions"   INTEGER NOT NULL DEFAULT 0,
          "last_push_at" TIMESTAMP(3),
          "done_at"      TIMESTAMP(3),
          "done_reason"  TEXT,
          "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "trip_watch_pkey" PRIMARY KEY ("trip_id")
        )
      `);
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "trip_watch_watch_from_idx" ON "trip_watch"("watch_from")`,
      );
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          ALTER TABLE "trip_watch" ADD CONSTRAINT "trip_watch_trip_id_fkey"
            FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL; END $$
      `);
      // Nachgereichte Spalten (Diagnose): Warum hat ein Tick NICHT gepusht?
      // Ohne das ist "still-free" von "Säule nicht gefunden" nicht zu
      // unterscheiden — beides sieht von außen nach Stille aus.
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "trip_watch" ADD COLUMN IF NOT EXISTS "last_reason" TEXT`,
      );
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "trip_watch" ADD COLUMN IF NOT EXISTS "last_error" TEXT`,
      );
      // Ankunfts-Push (15 min vor Ankunft, einmal pro Fahrt — auch wenn die
      // Säule frei ist). Zeitstempel = verschickt, NULL = steht noch aus.
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "trip_watch" ADD COLUMN IF NOT EXISTS "start_push_at" TIMESTAMP(3)`,
      );
    })().catch((e) => {
      // Beim Fehlschlag Cache leeren, damit ein späterer Aufruf neu versucht.
      tableReady = null;
      throw e;
    });
  }
  return tableReady;
}
