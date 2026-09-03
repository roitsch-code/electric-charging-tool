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
| M2 | Statischer Datenbestand (BNetzA + OCM, PostGIS-Umkreissuche) | offen |
| M3 | End-to-End ohne Push (Kurzbefehl → API → Ergebnisseite) | offen |
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

## API

```
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
