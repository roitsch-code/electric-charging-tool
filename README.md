# Ladeplanner

Zielzentrierte Ladeplanung fuer E-Autos. Die Autobahn-Ladeplanung ist geloest
(ABRP, Google Maps). **Ungeloest ist das Laden am Zielort** — passt ein
Ladepunkt in Gehdistanz zu meiner Aufenthaltsdauer, und ist er jetzt frei?

Vollstaendiges Konzept: [`docs/konzept.md`](docs/konzept.md).

Dies ist ein bewusstes **n=1-Projekt** (kein Multi-User, keine Skalierung).

## Stand

| Milestone | Inhalt | Status |
|---|---|---|
| **M0** | Scaffold: Next.js + TypeScript + Prisma, CI (Lint/Typecheck/Vitest) | ✅ |
| **M1** | Resolver: `maps.app.goo.gl` → Koordinaten, drei Stufen, Fixtures | ✅ |
| **M3** | Ranking (§8) + Ergebnisseite mit Top 3, Sprechtext, Deeplinks (Seed-Daten) | ✅ |
| **M2** | Datenimport (BNetzA + OCM) + PostGIS-Umkreissuche, austauschbare Quelle | ✅ (Code; DB-Aktivierung s. u.) |
| M4 | Realtime + Push (MobiData-BW-Poller, ntfy) | offen |
| M5 | ETA + Trigger (Directions API, Siri/CarPlay/Bluetooth, Pings) | offen |
| M6 | Freihaendig (Sprechtext, Vorlesen, drei Siri-Kurzbefehle) | offen |
| M7 | Echttest Emmerich → Hamburg | offen |

## Architektur (Kurzform)

iOS-Kurzbefehl → Next.js API (Vercel) → Postgres (Neon) + ntfy.sh Push.
Kein natives Xcode-Projekt, kein CarPlay-Entitlement, kein Hintergrund-GPS.
Begruendungen in [`docs/konzept.md`](docs/konzept.md), §6–§7.

## Der Resolver (M1)

Google Maps teilt auf iOS nur eine `public.url` ohne Koordinaten. Der Resolver
loest das in drei Stufen (`src/lib/resolver/`), Konzept §4:

1. **Redirect folgen** und Koordinaten aus der finalen URL parsen
   (`!3d!4d`-Pin, `/@lat,lng`, `?q=`/`?ll=`/…). → `method: "redirect"`
2. **Ortsnamen geocodieren** ueber Photon (Komoot), Nominatim als Fallback —
   kein API-Key, EU-gehostet. → `method: "geocode"`
3. **Manueller Fallback**: schlaegt beides fehl, fordert die App ein
   Eingabefeld an (`needsManualInput: true`). Kein Notnagel, sondern
   Pflichtfeature — Stufe 1/2 haengen an undokumentiertem Google-Verhalten.
   → `method: "manual"`

Die HTTP-Abhaengigkeiten (`followUrl`, `geocode`) sind injizierbar, damit der
Resolver ohne Netz gegen reale URL-Fixtures getestet wird
(`tests/fixtures/share-urls/`).

## Entwicklung

Voraussetzungen: Node 20+, npm. (Optional Postgres nur fuer laufende API-Calls;
Lint/Typecheck/Tests laufen ohne DB.)

```bash
npm install            # installiert Deps + prisma generate (postinstall)
cp .env.example .env   # DATABASE_URL eintragen (nur fuer die laufende API noetig)

npm run lint           # ESLint (next lint)
npm run typecheck      # tsc --noEmit
npm test               # Vitest (Resolver-Tests, kein Netz noetig)
npm run dev            # Next.js Dev-Server auf http://localhost:3000
```

Erwartete Ausgabe von `npm test`: alle Resolver-Suites gruen
(`extractCoordinates`, `extractPlaceName`, `resolveShareUrl`,
`resolveManualAddress`).

### Datenbank

```bash
npm run prisma:generate   # Client nach src/generated/prisma
npm run prisma:migrate    # Migration gegen die DATABASE_URL
```

Datenmodell: `prisma/schema.prisma` (Konzept §9) — `trips`, `trip_pings`,
`recommendations`, `chargepoints`, `chargepoint_status`.

## Ranking (M3)

`src/lib/chargers/` setzt Konzept §8 um und nutzt dabei das Fahrzeugprofil:

- **Radius-Erweiterung**: 500 m → 1000 m → 2000 m, das Ergebnis benennt die
  Erweiterung explizit.
- **Bedarfsklasse** aus Aufenthaltsdauer + Rückfahrt (`ac_ok` / `ac_or_dc` /
  `dc_required`).
- **Fahrzeug-Deckelung**: Die nutzbare Leistung wird bei der Akzeptanz des
  Autos gekappt (135 kW DC / 11 kW AC) — ein 300-kW-HPC wird nicht höher
  bewertet als ein 150-kW-Lader.
- **Score** = 0,4·Nähe + 0,4·Klassen-Match + 0,2·Verfügbarkeit.
- **Sprechtext** (§6.6): ausgeschriebene Einheiten, Gehdistanz im Text, keine
  IDs/Betreiber, ein Satz + Bewertung.
- **Ehrlichkeit** (§5.1): pro Ladepunkt Zeitstempel oder „Status unbekannt".

**Verfeinerung zu §8, Schritt 3**: Ein Ladepunkt am Ziel bekommt Rang 1 nur,
wenn er zur Bedarfsklasse passt. Ein 11-kW-AC-Punkt am Ziel wird bei
`dc_required` NICHT auf Rang 1 gesetzt — sonst würde man ihn empfehlen und
gleichzeitig als zu langsam bezeichnen. Siehe `PRIORITY_MIN_CLASS` in
`src/lib/chargers/rank.ts`.

Datenquelle in M3 ist ein Seed im Speicher (`src/lib/chargers/seed.ts`),
austauschbar gegen die PostGIS-Suche in M2 (gleiches `ChargerSource`-Interface).

## Echter Datenbestand (M2)

Import und Umkreissuche liegen fertig vor; aktiviert wird über eine DB und
eine Umgebungsvariable.

- **Import** (`src/lib/import/`): tolerante Parser für das **BNetzA-Ladesäulen­
  register** (CSV, Semikolon, Dezimalkomma, Vorspann-Zeilen, Spalten per Name)
  und **Open Charge Map** (JSON-API). Beide normalisieren auf `Charger`
  (AC/DC-Ableitung, stabile EVSE-IDs, Adresse). Upsert je `evse_id`.
- **Suche** (`src/lib/chargers/postgis-source.ts`): `ST_DWithin` auf einer
  inline aus lat/lng gebildeten geography; optionaler funktionaler GIST-Index
  (`prisma/sql/postgis.sql`). Gleiche `ChargerSource`-Schnittstelle wie der Seed.
- **Umschalten**: `getChargerSource()` (`source-factory.ts`) nimmt PostGIS nur,
  wenn `CHARGER_SOURCE=postgis` gesetzt ist — sonst weiter Seed.

### DB aktivieren — Schritt für Schritt

```bash
# 1. DATABASE_URL (Neon o. Ä.) in .env eintragen
cp .env.example .env   # DATABASE_URL setzen

# 2. Tabellen anlegen
npm run db:push

# 3. PostGIS-Extension + GIST-Index (einmalig; braucht psql)
npm run db:postgis     # = psql "$DATABASE_URL" -f prisma/sql/postgis.sql

# 4. Daten importieren
npm run import:bnetza -- ./ladesaeulen.csv      # CSV vorher manuell laden
OCM_API_KEY=… npm run import:ocm -- --country DE # optional, Key nötig

# 5. App auf die DB umstellen
#    lokal:  CHARGER_SOURCE=postgis npm run dev
#    Vercel: CHARGER_SOURCE=postgis als Env-Var setzen
```

Parser vorab offline prüfen (ohne DB): `npm run import:bnetza -- <csv> --dry`.

## API

```
GET /api/plan?lat=..&lng=..&name=..&dwell=..&return=..
  (statt lat/lng auch:  u=<share-url>   oder   to=<adresse>)
  dwell: Minuten ODER Label (kurz | paar | nacht | laenger)
  → 200 { destination, demandClass, usedRadiusM, expanded,
          spokenRecommendation, spokenAlternative, top[] }
  → 422 { needsManualInput, placeNameHint, reason }
  Beispiel: /api/plan?lat=53.5510&lng=9.9215&dwell=nacht

GET /plan?…    dieselben Parameter, aber als Ergebnisseite im Browser

POST /api/destinations
  { "shareUrl": "https://maps.app.goo.gl/…",
    "dwellMinutes": 480, "returnTripKm": 0 }
  → 201 { id, lat, lng, name, method, status }
  → 422 { needsManualInput: true, placeNameHint, reason }   (Stufe 3)
  Manueller Fallback:
  { "manualAddress": "Lichtentaler Allee, Baden-Baden", "dwellMinutes": 480 }

GET /api/destinations/:id
  → 200 { id, lat, lng, name, method, dwellMinutes, returnTripKm,
          status, recommendations }
```

## Deployment

Vercel (Next.js App Router). `DATABASE_URL` als Environment-Variable setzen.
`prisma generate` laeuft ueber den `postinstall`-Hook automatisch mit.
