# CLAUDE.md — Arbeitsanweisung für dieses Repo

Kurzkontext für Claude-Sessions. Für das fachliche Konzept siehe
[`docs/konzept.md`](docs/konzept.md), für die Standzeit-Lücke
[`docs/standzeit.md`](docs/standzeit.md).

## Was das ist

**Ladeplanner** — zielzentrierte Ladeplanung fürs E-Auto. Bewusstes
**n=1-Projekt** (ein Nutzer, ein Auto: Audi Q4 e-tron; kein Multi-User, keine
Skalierung). Die gelöste Frage: *Passt am Zielort ein Ladepunkt in Gehdistanz
zu meiner Aufenthaltsdauer, ist er frei — und **wie lange darf ich dort
stehen?***

## Harte Regeln (nicht verhandelbar)

- **Antworten auf Deutsch**, mit echten Umlauten (ä ö ü ß), kein `ae/oe/ue`.
- **Kein Seiten-Scroll.** Jede Seite passt in den Viewport — iPhone 15 Pro
  (Firefox iOS) **und** MacBook/iPad. Muster: variabler Freiraum **oben**,
  Inhalt **unten** verankert, mit großzügigen Abständen (nicht gedrückt).
  `html,body { height:100dvh; overflow:hidden }` in `globals.css` — nicht
  aufweichen. Breite Inhalte (Tabellen, Karte) scrollen in ihrem eigenen
  Container, nie die Seite.
- **Nichts halluzinieren.** Belegung, Leistung, Positionen und Standzeit-Regeln
  müssen stimmen oder ehrlich „unbekannt" sein. Regeln nur mit Quelle. Keine
  erfundenen Zahlen; Schätzungen als solche kennzeichnen.
- **Modell-Identität nie in Commits/PRs/Code** — nur im Chat.
- Vor Commit **immer** lokal grün machen: `npm run lint && npm run typecheck &&
  npm test && npx next build`. Erst dann pushen. (Kaputte Tests nach dem Code
  nachzuziehen kostet einen roten CI-Run — vorher mitziehen.)

## Datenquellen (Stand jetzt)

- **Ladepunkte + Live-Belegung: TomTom EV API** ist DIE Quelle, DE-weit,
  echtzeit, per Key (`TOMTOM_API_KEY`). Ein `poiSearch("charging station")`
  liefert je Station Position, Betreiber, Adresse, `chargingPark.connectors`
  (Typ/kW/AC-DC) **und** `dataSources.chargingAvailability.id` für die
  Live-Zähler. Code: `src/lib/chargers/tomtom-source.ts`.
  - TomTom liefert **denselben Standort mehrfach** (pro Connector-Gruppe) →
    zwingend nach Adresse/Koordinate **aggregieren**, sonst „1/1-Krümel".
  - Fällt der Key weg, greift `source-factory.ts` auf PostGIS bzw. Seed zurück.
- **Standzeit (Höchstparkdauer):** es gibt **keine** DE-weite Datenquelle —
  die Regel ist kommunal (StVO Z. 314 + Zusatzschild). Zwei Ebenen:
  1. kuratiertes Regelwerk `src/lib/rules/standzeit.ts` (mit Quellen im Kommentar),
  2. On-Demand-Recherche per Claude + Websuche (`standzeit-research.ts`),
     gespeichert in `city_rules` (`standzeit-db.ts`). Details:
     [`docs/standzeit.md`](docs/standzeit.md).
- **Karte:** Leaflet + Esri „Dark Gray Canvas"-Tiles (keyless; CARTO braucht
  inzwischen einen Key → Wasserzeichen). Tile-URL nutzt `{z}/{y}/{x}`.

## Wichtige Dateien

| Zweck | Datei |
|---|---|
| Ladepunkt-Quelle (live) | `src/lib/chargers/tomtom-source.ts` |
| Quelle umschalten | `src/lib/chargers/source-factory.ts` |
| Ranking / Score | `src/lib/chargers/rank.ts` |
| Plan (Radius, Top-N) | `src/lib/chargers/plan.ts` |
| Standzeit-Regelwerk | `src/lib/rules/standzeit.ts` |
| Standzeit-Recherche (Agent) | `src/lib/rules/standzeit-research.ts` |
| Standzeit-Persistenz | `src/lib/rules/standzeit-db.ts` |
| Standzeit-API | `src/app/api/standzeit/route.ts` |
| Startseite + Favoriten | `src/app/page.tsx`, `src/app/Favorites.tsx` |
| Ergebnis-Seite (Karten, Swipe, Standzeit-Knopf) | `src/app/plan/ResultView.tsx`, `ResultMap.tsx` |
| Viewport/No-Scroll-CSS | `src/app/globals.css` |

## Ranking (`rank.ts`)

- Score = `0,55·Nähe + 0,3·Klassen-Match + 0,15·Verfügbarkeit` (nähe-dominant,
  damit ein naher Schnelllader nicht hinter fernen AC-Säulen verschwindet).
- **Eignungs-Multiplikator** `suitabilityFactor`: bei `dc_required` wird ein
  AC-Punkt (× 0,2) unter jeden nutzbaren DC-Punkt gedrückt, bleibt aber
  sichtbar (AC-only-Fall). So schlägt Nähe nicht die Brauchbarkeit.
- Fahrzeug-Deckelung: nutzbare Leistung bei 135 kW DC / 11 kW AC gekappt.

## Favoriten (`Favorites.tsx`)

Zuhause (Ackerstraße 199) · Schwiegereltern (Ingenkampstraße 61, Emmerich) ·
**letzter gesuchter Spot** (aus `localStorage`, die beiden festen
ausgeschlossen). Klick übernimmt die oben gewählte Aufenthalt-Stufe — **kein**
fixes „lang".

## Entwicklung

Node ist hier direkt verfügbar (kein Docker in dieser Session nötig):

```bash
npm install
npm run lint && npm run typecheck && npm test && npx next build
npm run dev   # http://localhost:3000
```

## Deployment (Co-Host auf eigenem Server)

Läuft als Docker-Stack neben anderen Apps. **Auf dem Server** (nicht in dieser
Session — dort steckt Docker):

```bash
cd /opt/ladeplanner
git pull origin claude/new-project-kickoff-69wgyp
docker compose -f docker-compose.cohost.yml up -d --build
```

Env-Keys kommen aus `/opt/ladeplanner/.env` und werden in
`docker-compose.cohost.yml` durchgereicht: `DATABASE_URL`, `TOMTOM_API_KEY`,
`ANTHROPIC_API_KEY` (für den Standzeit-Knopf), optional `GOOGLE_PLACES_API_KEY`,
`NTFY_TOPIC`, `CRON_SECRET`. Neue Env-Variable → **auch** in die Compose-
`environment:`-Liste eintragen, sonst erreicht sie den Container nicht.

## Git

Feature-Branch: `claude/new-project-kickoff-69wgyp`. Commit-Nachrichten auf
Deutsch, sachlich. Keine PRs ohne ausdrückliche Bitte.
