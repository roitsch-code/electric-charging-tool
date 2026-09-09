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
  inzwischen einen Key → Wasserzeichen). Tile-URL nutzt `{z}/{y}/{x}`. **Zoombar**
  (Pinch/Mausrad/Doppelklick + dezente +/−-Buttons unten links); die
  Pin-Kollisions-Versätze hängen vom Zoom ab und werden bei `zoomend` neu
  berechnet (`ResultMap.tsx`), sonst driften die Pins.

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
| Notification-Pusher (Regeln) | `src/lib/notify/watch.ts` |
| Notification-Pusher (Durchlauf) | `src/lib/notify/watch-tick.ts`, `watch-db.ts` |
| Push-Texte / Alternative | `src/lib/notify/message.ts` |
| Cron (Ankunft + Überwachung) | `src/app/api/cron/dispatch/route.ts`, `cron/watch/route.ts` |
| Startseite + Favoriten | `src/app/page.tsx`, `src/app/Favorites.tsx` |
| Ergebnis-Seite (Karten, Swipe, Standzeit-Knopf) | `src/app/plan/ResultView.tsx`, `ResultMap.tsx` |
| Viewport/No-Scroll-CSS | `src/app/globals.css` |
| App-Icon bauen (Hybrid-Pipeline) | `scripts/icon/build-hybrid.mjs`, `flux.mjs`, `flux-bg.png` |
| Icon/Manifest (Next-Konvention) | `src/app/apple-icon.png`, `src/app/icon.svg`, `src/app/manifest.ts` |
| Auto-Deploy | `deploy.sh`, `.github/workflows/deploy.yml` |

## Ranking (`rank.ts`)

- Score = `0,55·Nähe + 0,3·Klassen-Match + 0,15·Verfügbarkeit` (nähe-dominant,
  damit ein naher Schnelllader nicht hinter fernen AC-Säulen verschwindet).
- **Eignungs-Multiplikator** `suitabilityFactor`: bei `dc_required` wird ein
  AC-Punkt (× 0,2) unter jeden nutzbaren DC-Punkt gedrückt, bleibt aber
  sichtbar (AC-only-Fall). So schlägt Nähe nicht die Brauchbarkeit.
- Fahrzeug-Deckelung: nutzbare Leistung bei 135 kW DC / 11 kW AC gekappt.

## Notification-Pusher (`notify/watch.ts`)

Ab **15 Minuten vor Ankunft** prüft der Minuten-Cron, ob die **angefahrene**
Säule noch frei ist. Die Säule ist die im Ergebnis-Karussell gewählte; der
„Losfahren"-Knopf schickt sie als `target` an `POST /api/trips`, das Fenster
liegt in `trip_watch` (ETA − 15 min bis ETA + 10 min Gnadenfrist).

Entscheidungsregeln (`decideWatch`, vollständig getestet in
`tests/notify/watch.test.ts`):

| Zustandswechsel | Push? |
|---|---|
| frei → **0 frei** / belegt / defekt | **ja**, mit Alternative |
| 3/4 frei → 2/4 frei | nein (ist ja noch frei) |
| **0 frei**, auch ohne bekannten Vorzustand | **ja** (0 löst immer aus) |
| Zustand unbekannt (keine Live-Daten) | nein — nichts halluzinieren |
| Säule nicht mehr in der Antwort | nein — Datenlücke ≠ belegt |
| bereits einmal umgeleitet | nein (kein Push-Gewitter im Minutentakt) |

„Belegt" = **null freie Punkte** (`freePoints`, sonst der Status). Eine Säule,
die während der Fahrt **defekt** gemeldet wird, löst denselben Push aus — laden
kann man dort auch nicht —, heißt im Text aber korrekt „außer Betrieb". Nach dem
Ausweich-Push ist die Überwachung beendet, der Trip steht auf `diverted`.

**Der Push-Text** (`spokenDiversion` in `chargers/spoken.ts`) wird im Auto
vorgelesen, also so knapp wie möglich und in der Reihenfolge, in der man ihn
braucht — was ist los, wohin stattdessen, wie weit zu Fuß, frei, wie schnell:

> Ladeplanner: Gastwerk Hotel Tiefgarage ist belegt. Ausweichen auf
> Supermarkt-Parkplatz, 550 Meter zum Ziel, einer von zwei Punkten frei,
> 11 Kilowatt.

Findet sich **keine** Alternative, endet die Ansage nicht in der Sackgasse,
sondern sagt, was jetzt zu tun ist — mit passendem Knopf (Autofahrt ans Ziel,
kein Fußweg):

> Ladeplanner: Gastwerk Hotel Tiefgarage ist belegt. Keine freie Alternative
> in Gehdistanz. Navigation stattdessen zum Ziel.

Die Alternative wird **namentlich** genannt — ohne Namen weiß man nicht, wohin
man fährt, und Antippen ist während der Fahrt keine Option (§ 23 Abs. 1a StVO).
Der Zielname wird nicht wiederholt („550 Meter zum Ziel", nicht „550 Meter vom
Gastwerk Hotel Hamburg"). Eine Bewertung kommt **nur**, wenn die Alternative
nicht zum Bedarf passt („Nur Wechselstrom, für den kurzen Halt zu wenig") —
„Reicht über Nacht" wäre hier Ballast. Ein Test deckelt die Länge bei
30 Wörtern.
Fahrten mit überwachter Säule bekommen **keinen** zusätzlichen Ankunfts-Push —
sonst käme zweimal etwas, obwohl die Säule schon gewählt ist.

Der Durchlauf hängt im bestehenden `/api/cron/dispatch` (Minutentakt, ofelia
bleibt unverändert); `/api/cron/watch` löst ihn einzeln aus, zum Prüfen. Die
Tabelle `trip_watch` legt die App selbst an (`watch-db.ts`, gleiches Muster wie
`city_rules`) — **kein** Migrationslauf beim Auto-Deploy nötig.

## Versandweg für Pushes (`notify/send.ts`)

**Telegram hat Vorrang, ntfy ist nur noch Rückfall.** Grund, recherchiert und
belegt: iOS kündigt Benachrichtigungen von Drittanbieter-Apps **nur** an, wenn
die App sie als zeitkritisch oder als Direktnachricht kennzeichnet
([Apple 102536](https://support.apple.com/en-us/102536)). ntfy tut das nicht —
die nötigen Berechtigungen sind laut offenem Issue
[ntfy#1680](https://github.com/binwiederhier/ntfy/issues/1680) im Xcode-Projekt
gar nicht eingerichtet. Telegram unterstützt „Mitteilungen ankündigen" seit
Ende 2020 als erste Drittanbieter-App; seine Nachrichten sind für iOS echte
Direktnachrichten.

- Konfiguration: `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (beide nötig),
  sonst `NTFY_TOPIC`. Beides fehlt → `pushTransport()` liefert `null`, Cron
  bricht sauber ab. **Neue Env-Variable auch in die Compose-`environment:`.**
- Die Deeplinks gehen als **Inline-Tastatur**, nie in den Text — eine URL im
  Text würde Zeichen für Zeichen mitgesprochen.
- Einstellung am iPhone: **Einstellungen → Mitteilungen → Mitteilungen
  ankündigen**, dort „Kopfhörer" und Telegram aktivieren. **Nicht** unter Siri:
  Auf EU-iPhones fehlt Siri AI unter iOS 27 wegen des DMA
  ([Apple Newsroom, 6/2026](https://www.apple.com/newsroom/2026/06/due-to-dma-siri-ai-delayed-in-eu-for-ios-27-and-ipados-27/)),
  der Menüpunkt „Apple Intelligence & Siri" aus Apples englischer Anleitung
  existiert dort nicht.
- Vorlesen setzt voraus: Kopfhörer getragen, **Gerät gesperrt**, dunkler
  Bildschirm. Siri kündigt nichts an, während das Gerät benutzt wird.

## Favoriten (`Favorites.tsx`)

Zuhause (Ackerstraße 199) · Schwiegereltern (Ingenkampstraße 61, Emmerich) ·
**letzter gesuchter Spot** (aus `localStorage`, die beiden festen
ausgeschlossen). Klick übernimmt die oben gewählte Aufenthalt-Stufe — **kein**
fixes „lang".

## App-Icon / Homescreen-Web-App

Das Icon (dunkler Blitz auf Pink→Coral) ist ein **Hybrid**: eine FLUX-Textur
liefert **nur** die organische Helligkeits-Struktur (entsättigt, geblurrt, als
Soft-Light-Ebene), die Farben kommen exakt aus dem Marken-Verlauf `--grad`
(`#FF86B9` → `#FF7E5A`). So bleibt die Palette markentreu — **kein
Orange/Violett/Blau** (FLUX driftet sonst dorthin).

- **Bauen/ändern:** `node scripts/icon/build-hybrid.mjs` (rein `sharp`, kein
  Chromium). Stellschrauben oben in der Datei: `BRIGHTNESS`, `SATURATION`,
  `TEXTURE`, Blitz-Pfad. Erzeugt Master + alle Größen + Favicon.
- **Neue FLUX-Textur:** `BFL_API_KEY=… node scripts/icon/flux.mjs "<prompt>"
  scripts/icon/flux-bg.png`. `BFL_API_KEY` (Black Forest Labs) ist ein **Build-
  Key, nicht zur Laufzeit** — gehört NICHT in die Compose-`environment:`. Der
  approvte Hintergrund `scripts/icon/flux-bg.png` ist eingecheckt (FLUX ist nicht
  deterministisch → sonst nicht reproduzierbar).
- **Verdrahtung** über Next-Datei-Konventionen (keine handgepflegten
  `<head>`-Links): `src/app/apple-icon.png` (180, Homescreen), `src/app/icon.svg`
  (Favicon), `src/app/manifest.ts` (Standalone), `appleWebApp`-Metadaten in
  `src/app/layout.tsx`.
- **Homescreen nur via Safari** — Firefox iOS legt kein echtes Web-App-Icon an,
  nur ein Lesezeichen. iOS cached Icons: nach Änderung altes Homescreen-Icon
  löschen und neu hinzufügen, sonst bleibt das alte.

## Entwicklung

Node ist hier direkt verfügbar (kein Docker in dieser Session nötig):

```bash
npm install
npm run lint && npm run typecheck && npm test && npx next build
npm run dev   # http://localhost:3000
```

## Deployment (Co-Host auf eigenem Server)

Läuft als Docker-Stack neben anderen Apps auf dem eigenen Server (dort steckt
Docker — **nicht** in dieser Session). Der Server steht auf `main`.

**Auto-Deploy ist der Normalfall — nichts tun.** Ein Cron auf dem Server prüft
alle ~3 Min, ob `origin/main` neue Commits hat, und baut nur bei Änderung neu
(`git pull --ff-only` + `docker compose … up -d --build`). Ein Merge nach `main`
geht also von selbst live; **kein manueller Deploy nötig.** Der Cron-Eintrag
(einmalig gesetzt, idempotent per Marker-Kommentar):

```cron
*/3 * * * * cd /opt/ladeplanner && git fetch origin main -q && [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ] && git pull --ff-only origin main && docker compose -f docker-compose.cohost.yml up -d --build >/tmp/ladeplanner-deploy.log 2>&1 # ladeplanner-autodeploy
```

Zusätzlich liegt ein GitHub-Actions-Workflow `.github/workflows/deploy.yml`
bereit (SSH-Deploy bei Push auf `main`, ruft `deploy.sh`). Er ist **inaktiv**,
solange die Secrets `DEPLOY_HOST`/`DEPLOY_USER`/`DEPLOY_SSH_KEY` fehlen, und
überspringt sich dann geräuschlos. Aktiver Weg ist der Cron oben.

**Manuell deployen** (nur falls nötig, auf dem Server):

```bash
cd /opt/ladeplanner && git pull origin main && docker compose -f docker-compose.cohost.yml up -d --build
# oder kurz:  /opt/ladeplanner/deploy.sh
```

Verifizieren, dass das laufende Image den erwarteten Code enthält (Node ist im
Container vorhanden), Beispiel Standzeit-API:

```bash
docker exec ladeplanner-app node -e "fetch('http://localhost:3000/api/standzeit?city=Emmerich&connector=ac').then(r=>r.json()).then(d=>console.log(JSON.stringify(d)))"
```

Env-Keys kommen aus `/opt/ladeplanner/.env` und werden in
`docker-compose.cohost.yml` durchgereicht: `DATABASE_URL`, `TOMTOM_API_KEY`,
`ANTHROPIC_API_KEY` (für den Standzeit-Knopf), optional `GOOGLE_PLACES_API_KEY`,
`NTFY_TOPIC`, `CRON_SECRET`. Neue Env-Variable → **auch** in die Compose-
`environment:`-Liste eintragen, sonst erreicht sie den Container nicht.

## Git

**Default- und Produktions-Branch: `main`** — der Server deployt daraus.
Commit-Nachrichten auf Deutsch, sachlich. Vor jedem Push lokal grün machen
(lint/typecheck/test/build). Keine PRs ohne ausdrückliche Bitte.

Historie: initial auf `claude/new-project-kickoff-69wgyp` entwickelt; dieser
Branch wurde nach `main` überführt und ist danach obsolet.
