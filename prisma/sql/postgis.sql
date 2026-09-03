-- PostGIS-Setup fuer die Umkreissuche (Konzept §5.1, M2).
-- Einmalig NACH `prisma db push` ausfuehren (z. B. `psql "$DATABASE_URL" -f prisma/sql/postgis.sql`).
--
-- Es wird KEINE zusaetzliche Spalte angelegt: die geography wird in der Query
-- inline aus lat/lng gebildet. Der funktionale GIST-Index unten beschleunigt
-- ST_DWithin. Ohne den Index funktioniert alles trotzdem (Sequential Scan).
--
-- Hinweis: Ein erneutes `prisma db push` kann den Index verwerfen. Dann diese
-- Datei einfach noch einmal ausfuehren.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE INDEX IF NOT EXISTS chargepoints_geog_gist
  ON chargepoints
  USING GIST ((ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography));
