-- Fügt die Spalte total_points (Anzahl Ladepunkte je Station, AFIR-Aggregat)
-- non-destruktiv hinzu. Auf dem Server einmalig ausführen:
--   psql "$DATABASE_URL" -f prisma/sql/total_points.sql
-- Alternativ (synchronisiert das ganze Schema): npm run db:push
ALTER TABLE chargepoints ADD COLUMN IF NOT EXISTS total_points integer;
