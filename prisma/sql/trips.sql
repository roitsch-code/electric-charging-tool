-- Trip-Tabellen fuer M5 (Push vor Ankunft). Idempotent: mehrfach ausfuehrbar.
-- Einmalig anlegen, z. B. im Neon-SQL-Editor (Console -> SQL Editor) oder auf
-- dem Server via `npm run db:trips` (braucht psql) bzw. `npx prisma db push`.

-- Enums (CREATE TYPE kennt kein IF NOT EXISTS -> per DO-Block absichern)
DO $$ BEGIN
  CREATE TYPE "ResolutionMethod" AS ENUM ('redirect', 'geocode', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "StartTrigger" AS ENUM ('carplay', 'bluetooth', 'siri');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TripStatus" AS ENUM ('planned', 'driving', 'notified', 'diverted', 'done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "trips" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "raw_share_url" TEXT NOT NULL,
  "resolved_lat" DOUBLE PRECISION,
  "resolved_lng" DOUBLE PRECISION,
  "resolved_name" TEXT,
  "resolution_method" "ResolutionMethod",
  "dwell_minutes" INTEGER,
  "return_trip_km" INTEGER,
  "started_at" TIMESTAMP(3),
  "start_trigger" "StartTrigger",
  "eta" TIMESTAMP(3),
  "eta_updated_at" TIMESTAMP(3),
  "notify_at" TIMESTAMP(3),
  "notified_at" TIMESTAMP(3),
  "status" "TripStatus" NOT NULL DEFAULT 'planned',
  CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "trip_pings" (
  "id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recalculated_eta" TIMESTAMP(3),
  CONSTRAINT "trip_pings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "recommendations" (
  "id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "evse_id" TEXT NOT NULL,
  "walking_m" INTEGER NOT NULL,
  "spoken_text" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "trips_status_idx" ON "trips"("status");
CREATE INDEX IF NOT EXISTS "trips_notify_at_idx" ON "trips"("notify_at");
CREATE INDEX IF NOT EXISTS "trip_pings_trip_id_idx" ON "trip_pings"("trip_id");
CREATE INDEX IF NOT EXISTS "recommendations_trip_id_idx" ON "recommendations"("trip_id");

DO $$ BEGIN
  ALTER TABLE "trip_pings" ADD CONSTRAINT "trip_pings_trip_id_fkey"
    FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_trip_id_fkey"
    FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
