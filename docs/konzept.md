# Ladeplanner — Konzept & Umsetzungsplan

**Arbeitstitel:** `ladeplanner`
**Autor:** Markus
**Stand:** 2026-09-03 (Rev. 2 — Freihand-Bedienung, Navigationsübergabe, ETA)
**Zweck dieses Dokuments:** Übergabe an ein Claude Code Projekt. Enthält Scope, Architektur, Datenquellen, Milestones und Repo-Setup. Kein Marketing, keine Vision — nur was gebaut wird.

---

## 1. Problem

Beim Fahren eines E-Autos zu einem Ziel ist die Autobahn-Ladeplanung gelöst (ABRP, Google Maps, herstellereigene Navi-Systeme). **Nicht gelöst ist das Laden am Zielort.**

Konkret unbeantwortet bleibt:

- Gibt es am Ziel selbst (Hotel, Restaurant, Besuch) eine Lademöglichkeit?
- Wenn nein: was liegt in **Gehdistanz** — nicht "im Umkreis von 2 km"?
- Passt der Ladepunkt zu meiner **Aufenthaltsdauer**? Über Nacht reicht 11 kW AC. Zwei Stunden und dann zurück heißt DC.
- Ist der Ladepunkt **jetzt gerade** frei?

Bestehende Apps lösen das nicht, weil sie stationszentriert sind (Favorit abonnieren) statt zielzentriert.

## 2. Scope

### In Scope
- Ziel per iOS Share Sheet aus Google Maps entgegennehmen
- Ladepunkte am Ziel und in Gehdistanz finden
- Ranking nach Aufenthaltsdauer, Gehdistanz, Leistung, Verfügbarkeit
- Push-Benachrichtigung kurz vor Ankunft, Zeitpunkt abhängig von der Gesamtdistanz
- **Freihändige Bedienung im Fahrbetrieb:** Vorlesen statt Anzeigen, Sprachbefehl statt Tippen
- **Übergabe an die Navigation:** Zielwechsel zur Ladesäule, danach Fußweg zum eigentlichen Ziel

### Explizit NICHT in Scope
- Routenplanung, Ladekurven, Verbrauchsprognosen → macht ABRP besser
- Autobahn-Ladestopps unterwegs → macht Google Maps + ABRP gut genug
- Bezahlung, Ladevorgang starten, Roaming
- CarPlay (siehe Abschnitt 7, Entitlement nicht erreichbar)
- Multi-User, Accounts, Skalierung — **das ist ein n=1 Projekt**

## 3. User Flow

Der Ablauf zerfällt in drei Phasen: **Planen** (vor der Fahrt, Display erlaubt), **Fahren** (Hände am Lenkrad, nur Sprache), **Ankommen** (Auto steht, Display wieder erlaubt).

### Phase 1 — Planen (vor der Abfahrt)

```
1. Ziel in Google Maps suchen, z.B. "Gastwerk Hotel Hamburg"
2. Teilen → "Ladeplanner"
3. Kurzbefehl fragt zwei Dinge:
   - Wie lange bleibst du?  (Kurz / Paar Stunden / Über Nacht / Länger)
   - Direkte Rückfahrt?     (ja / nein)
4. POST an /api/trips  →  Backend:
   - löst die Share-URL zu Koordinaten auf (Abschnitt 4)
   - holt ETA über Google Directions API (Abschnitt 6.3)
   - sucht Ladepunkte im Gehradius, bildet Ranking
   - plant den Push-Zeitpunkt: ETA minus X (Tabelle unten)
5. Bestätigung: "Ziel gesetzt. Melde mich 15 Minuten vor Ankunft."
```

### Phase 2 — Fahren (freihändig)

```
6. Fahrtstart signalisieren — drei gleichwertige Wege, siehe Abschnitt 6.4:
   a) CarPlay-Automation (läuft ohne Bestätigung, wenn eigenes Handy verbunden)
   b) Bluetooth-Automation auf die Freisprechanlage
   c) "Hey Siri, Ladeplanner starten"  ← funktioniert immer, auch als Beifahrer
7. Navigation läuft wie gewohnt in Google Maps. Ladeplanner tut nichts.
8. 1-2 Zwischen-Pings korrigieren die ETA (Abschnitt 6.5) — kein Dauertracking.
9. X Minuten vor Ankunft: Push. Siri liest ihn über CarPlay/AirPods vor:
   "Ladeplanner: 200 Meter vom Gastwerk Hotel, vier von sechs Punkten frei,
    11 Kilowatt. Reicht über Nacht."
```

### Phase 3 — Umleiten und Ankommen

```
10. "Hey Siri, Ladeplanner umleiten"
    → Kurzbefehl holt GET /api/trips/current/recommendation
    → öffnet Google Maps mit der Ladesäule als Ziel, Navigation startet neu
11. Laden. Auto steht — ab hier ist das Display wieder erlaubt.
12. "Hey Siri, Ladeplanner zum Ziel"  (oder Tap auf den zweiten Link)
    → Google Maps mit travelmode=walking vom Ladepunkt zum Hotel
```

### Trigger-Zeitpunkt (kontextabhängig)

| Gesamtdistanz | Push vor Ankunft | Begründung |
|---|---|---|
| < 100 km | 5 min | Es geht nur noch um die letzte Abbiegung |
| 100–300 km | 10 min | Etwas Vorlauf für Umentscheidung |
| > 300 km | 15 min | Ggf. noch DC-Stopp vor dem Ziel einplanen |

## 4. Die Share-Sheet-Lösung

**Das Problem:** Google Maps teilt auf iOS 17+ nur noch eine `public.url` — eine `maps.app.goo.gl`-Kurz-URL **ohne Koordinaten**. Kein `plain-text`, kein strukturiertes Place-Objekt. (Apple Maps hatte in iOS 26 zeitweise dasselbe Problem, wurde von Apple zurückgerollt.)

**Die Lösung: dreistufige Auflösungskette im Backend.**

```
Stufe 1 — Redirect auflösen
  GET https://maps.app.goo.gl/XXXX  (follow redirects)
  → https://www.google.com/maps/place/Gastwerk+Hotel/@53.55,9.93,17z/data=...
  → Regex auf /@(-?\d+\.\d+),(-?\d+\.\d+)  → fertig, exakte Koordinaten

Stufe 2 — Name aus der URL geocodieren
  Falls kein /@lat,lng im Pfad: Segment nach /place/ extrahieren,
  URL-decodieren → "Gastwerk Hotel Hamburg"
  → Photon (Komoot, DE-gehostet) oder Nominatim → Koordinaten

Stufe 3 — Manueller Fallback
  Auflösung fehlgeschlagen → App zeigt Eingabefeld,
  Adresse eintippen oder einfügen → Stufe 2
```

**Wichtig:** Stufe 1 und 2 sind undokumentiertes Verhalten von Google. Die URL-Struktur kann sich jederzeit ändern. Deshalb ist Stufe 3 kein Notnagel, sondern **Pflichtbestandteil** — und die Auflösungslogik gehört in ein eigenes, gut getestetes Modul mit Fixtures echter URLs.

Geocoding bewusst über **Photon/Nominatim** statt Google Places: kein API-Key, kein Kontingent, keine Kosten, EU-gehostet.

## 5. Datenquellen

### 5.1 Ladeinfrastruktur — die Lage hat sich 2025/26 fundamental geändert

Die EU-Verordnung **AFIR (EU) 2023/1804, Art. 20** verpflichtet Betreiber öffentlich zugänglicher Ladepunkte seit dem 14.04.2025, statische **und dynamische** Daten (Verfügbarkeit, Ad-hoc-Preise) kostenlos über eine API bereitzustellen. Dynamische Daten müssen innerhalb einer Minute aktualisiert werden. Seit dem 14.04.2026 ist DATEX II Pflichtformat, nationaler Zugangspunkt in Deutschland ist die **Mobilithek**.

**Konsequenz: Ein kommerzieller Hubject- oder Gireve-Vertrag ist nicht mehr nötig.**

| Quelle | Abdeckung | Realtime | Format | Kosten |
|---|---|---|---|---|
| **MobiData BW / OCPDB** | Baden-Württemberg | ja | OCPI 3.0 + DATEX II | frei |
| **Mobilithek** | DE (Abo je Anbieter) | ja | DATEX II | frei |
| **BNetzA Ladesäulenregister** | DE | nein | CSV | frei |
| **Open Charge Map** | international | nein/teils | JSON | frei, Key |

**Empfohlene Strategie:**
- **Basis-Layer:** BNetzA-Register + Open Charge Map für Standorte und Eigenschaften. Statisch, lokal in Postgres cachen, wöchentlich aktualisieren.
- **Realtime-Layer:** Mobilithek-Abos für die relevanten CPOs. MobiData BW als Referenzimplementierung zum Entwickeln, weil sofort und ohne Onboarding zugänglich (`https://api.mobidata-bw.de/ocpdb/api/public/datex/v3.5/json/realtime`).
- **Ehrlichkeitsgebot:** Verfügbarkeitsdaten sind nur so gut wie das Backend des Betreibers. Die App muss **immer den Zeitstempel der letzten Aktualisierung anzeigen** und bei fehlenden Realtime-Daten "Status unbekannt" sagen statt zu raten.

### 5.2 Sonstige
- **ETA:** Google Directions API mit `departure_time=now` — liefert Live-Verkehr, also dieselbe Berechnung wie Google Maps selbst (Begründung in 6.3)
- **Routing (Geometrie, Gehwege):** OpenRouteService oder Valhalla (offen, EU)
- **Geocoding:** Photon (Komoot) mit Nominatim als Fallback
- **Karte (falls UI):** MapLibre + MapTiler oder Protomaps

## 6. Architektur

### Wichtige Randbedingung
Entwicklung läuft über **Claude Code Cloud-Sessions ohne lokales Terminal**. Damit ist ein natives Xcode-Projekt in Phase 1 nicht praktikabel. Der Plan umgeht das komplett.

```
┌─────────────────────────────────────┐
│  iOS Kurzbefehl (Shortcuts)         │
│  - im Share Sheet registriert       │
│  - fragt Aufenthaltsdauer ab        │
│  - POST an /api/destinations        │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Next.js API (Vercel)               │
│  /api/destinations   POST           │
│  /api/destinations/:id GET          │
│  /api/cron/dispatch  (Vercel Cron)  │
├─────────────────────────────────────┤
│  resolver/   Share-URL → Koordinaten│
│  chargers/   Suche + Ranking        │
│  realtime/   OCPI/DATEX II Poller   │
│  notify/     Push-Versand           │
└──────────────┬──────────────────────┘
               │
      ┌────────▼────────┐   ┌──────────────┐
      │  Postgres       │   │  ntfy.sh     │
      │  (Neon)         │   │  Push        │
      └─────────────────┘   └──────────────┘
```

**Warum kein Geofencing in Phase 1:** Das Backend kennt beim Teilen den Startpunkt und das Ziel und kann daraus die ETA berechnen. Damit lässt sich der Push **zeitgesteuert** planen (Vercel Cron, Minutentakt) — ohne Hintergrund-Standortüberwachung, ohne native App, ohne Batterieverbrauch. Bei Stau wird der Push zu früh kommen; das ist für v1 akzeptabel. Geofencing ist ein Phase-2-Thema.

**Push via ntfy.sh:** Kein Apple Push Certificate, kein App Store, funktioniert sofort. Topic abonnieren, HTTP POST zum Senden.

### Stack
- **Backend/Frontend:** Next.js (App Router), TypeScript
- **DB:** Postgres (Neon oder Supabase), Prisma oder Drizzle
- **Deployment:** Vercel
- **Ingest-Jobs:** Vercel Cron; falls zu langlaufend, separater Python-Worker im Container
- **Tests:** Vitest, mit echten URL-Fixtures für den Resolver

### 6.3 ETA — warum Google Directions

Google Maps teilt seine laufende ETA mit **keiner** anderen App. Kein API, kein Broadcast, kein Intent. Auslesen ist ausgeschlossen.

Dieselbe Zahl lässt sich aber selbst beschaffen: Die **Google Directions API** mit `departure_time=now` nutzt dasselbe Verkehrsmodell wie die Maps-App. Bei 2–3 Abfragen pro Fahrt bleibt das im kostenlosen Kontingent.

OpenRouteService bleibt als Fallback und für Gehweg-Distanzen, ist aber beim Live-Verkehr deutlich schwächer — und genau der entscheidet über die Push-Qualität.

### 6.4 Fahrtstart-Trigger — drei Wege, kein CarPlay-Zwang

Das Backend muss wissen, wann die Fahrt beginnt, um die ETA zu verankern. **Ein Kurzbefehl kann sich nicht selbst zu einem berechneten Zeitpunkt starten** — persönliche Automationen brauchen einen echten Trigger, und die meisten verlangen eine Bestätigung am Display. Ausnahmen ohne Bestätigung: CarPlay, Bluetooth, NFC, Wecker, Fokus.

Deshalb drei gleichwertige Wege:

| Weg | Trigger | Funktioniert wenn |
|---|---|---|
| **A** | CarPlay verbunden | eigenes Handy am CarPlay |
| **B** | Bluetooth-Verbindung zur Freisprechanlage | Auto verbunden, auch ohne CarPlay |
| **C** | `"Hey Siri, Ladeplanner starten"` | **immer** — auch als Beifahrer im fremden Auto |

**Weg C ist der Primärweg**, A und B sind Komfort. Der reale Fall "meine Frau fährt, ihr Handy hängt am CarPlay" ist damit abgedeckt. Alle drei rufen dieselbe Route: `POST /api/trips/current/start`.

### 6.5 Standort-Pings statt Dauertracking

Kein Geofencing, keine Hintergrundortung — beides kostet Akku und braucht eine native App.

Stattdessen sendet der Kurzbefehl **1–2 Pings pro Fahrt** (etwa bei 50 % und 80 % der geplanten Fahrtzeit), das Backend rechnet die ETA neu und verschiebt den geplanten Push. Kosten: zwei HTTP-Requests, Akkuverbrauch praktisch null.

Bei Fahrten unter 100 km entfällt der Ping — die Ungenauigkeit ist kleiner als das Push-Fenster.

### 6.6 Freihändige Bedienung

Rechtlicher Rahmen: § 23 Abs. 1a StVO. Das Gerät darf während der Fahrt nicht aufgenommen oder länger als kurz angesehen werden. Eine Push-Mitteilung, die zum Lesen und Antippen zwingt, ist damit **kein akzeptables Interface** — das Konzept muss ohne Display auskommen.

**Ausgabe — Vorlesen:** iOS "Mitteilungen ankündigen" liest über CarPlay und AirPods auch Mitteilungen normaler Apps vor, sofern für die App freigegeben. Der Push-Text ist deshalb **als gesprochener Satz zu formulieren**, nicht als Bildschirmtext:

> "Ladeplanner: 200 Meter vom Gastwerk Hotel, vier von sechs Punkten frei, 11 Kilowatt. Reicht über Nacht."

Regeln für den Text: keine Abkürzungen, keine EVSE-IDs, keine Betreibernamen, maximal ein Satz plus Bewertung. Zahlen ausgeschrieben, wo Siri sonst stolpert.

**Eingabe — Sprachbefehl:** Siri kann auf eine vorgelesene Mitteilung nur bei **Nachrichten-Apps** antworten. Bei ntfy oder einer eigenen App geht das nicht. Die Reaktion ist deshalb kein "Antworten", sondern ein eigener Sprachbefehl:

- `"Hey Siri, Ladeplanner umleiten"` → Navigation zur empfohlenen Ladesäule
- `"Hey Siri, Ladeplanner Alternative"` → nächstbeste Option vorlesen
- `"Hey Siri, Ladeplanner zum Ziel"` → Fußweg-Navigation ab Ladepunkt

Jeder dieser Kurzbefehle ist zustandslos: Er ruft `GET /api/trips/current/recommendation` ab und handelt danach. Die gesamte Logik liegt im Backend, der Kurzbefehl bleibt dumm.

### 6.7 Übergabe an die Navigation

Kein Eigenbau — zwei Google-Maps-Deeplinks reichen:

```
Umleiten zur Ladesäule:
  https://www.google.com/maps/dir/?api=1
    &destination=<lat>,<lng>
    &travelmode=driving

Fußweg vom Ladepunkt zum eigentlichen Ziel:
  https://www.google.com/maps/dir/?api=1
    &origin=<charger_lat>,<charger_lng>
    &destination=<dest_lat>,<dest_lng>
    &travelmode=walking
```

Beide Links liegen zusätzlich in der Push-Mitteilung, für den Fall dass das Auto steht und Tippen erlaubt ist. Die Gehdistanz gehört **in den Text**, nicht erst hinter den Link — nur so ist im Vorbeihören klar, ob es 200 Meter oder ein Kilometer sind.

## 7. Warum kein CarPlay

CarPlay-Apps sind auf feste Kategorien beschränkt. Für "EV Charging" existiert eine offizielle Kategorie, aber sie erfordert ein gesondertes **Entitlement von Apple**, das nur an etablierte Anbieter vergeben wird — ein Developer Account reicht nicht. Ein Antrag für ein Ein-Personen-Projekt ist chancenlos.

**Ersatz:** Sprachausgabe über "Mitteilungen ankündigen" plus Siri-Kurzbefehle — siehe 6.6. Das ist für diesen Zweck sogar besser als eine CarPlay-App, weil es ohne Blick aufs Display auskommt.

## 8. Ranking-Logik

Eingaben: Zielkoordinaten, Aufenthaltsdauer, Rückfahrt ja/nein.

```
1. Kandidaten laden: alle Ladepunkte im Radius 500 m (Luftlinie)
2. Wenn Treffer == 0: Radius schrittweise auf 1000 m, dann 2000 m
   erweitern und das in der Ausgabe EXPLIZIT benennen
3. Ladepunkt AM Ziel (gleiche Adresse / POI-Match): immer Rang 1,
   unabhängig von der Leistung
4. Bedarfsklasse bestimmen:
   - Aufenthalt > 6 h        → AC 11 kW reicht, bevorzugen (günstiger)
   - Aufenthalt 1–6 h        → AC 22 kW oder DC
   - Aufenthalt < 1 h ODER
     direkte Rückfahrt > 150 km → DC ≥ 150 kW erforderlich
5. Score = w1·(1/Gehdistanz) + w2·Klassen-Match + w3·Verfügbarkeit
6. Top 3 zurückgeben, mit Zeitstempel der Verfügbarkeitsdaten
```

## 9. Datenmodell (Entwurf)

```
trips
  id, created_at, raw_share_url, resolved_lat, resolved_lng,
  resolved_name, resolution_method (redirect|geocode|manual),
  dwell_minutes, return_trip_km,
  started_at, start_trigger (carplay|bluetooth|siri),
  eta, eta_updated_at, notify_at, notified_at,
  status (planned|driving|notified|diverted|done)

trip_pings           -- ETA-Korrektur unterwegs
  id, trip_id, lat, lng, received_at, recalculated_eta

recommendations      -- was zuletzt empfohlen wurde, fuer die Sprachbefehle
  id, trip_id, rank, evse_id, walking_m, spoken_text, created_at

chargepoints          -- statischer Cache
  id, evse_id, lat, lng, operator, power_kw, connector_type,
  address, source, updated_at

chargepoint_status    -- dynamisch
  evse_id, status, last_updated, source
```

## 10. Milestones

| # | Ziel | Definition of Done |
|---|---|---|
| **M0** | Repo-Setup | Next.js + TS + Postgres, Vercel Deploy läuft, CI grün |
| **M1** | Resolver | `maps.app.goo.gl`-URL → Koordinaten. Fixtures für 10 reale URLs, alle 3 Stufen getestet |
| **M2** | Statischer Datenbestand | BNetzA + OCM importiert, Umkreissuche per PostGIS, API liefert Ladepunkte zu Koordinaten |
| **M3** | End-to-End ohne Push | Kurzbefehl → API → Ergebnisseite im Browser mit Top 3 |
| **M4** | Realtime + Push | MobiData-BW-Poller, ntfy-Push zum berechneten Zeitpunkt |
| **M5** | ETA + Trigger | Directions-API angebunden, Start per Siri/CarPlay/Bluetooth, Pings korrigieren die ETA |
| **M6** | Freihändig | Push-Text als Sprechtext, Vorlesen getestet, drei Siri-Kurzbefehle inkl. Deeplinks |
| **M7** | Echttest | Fahrt Emmerich → Hamburg. Erfolg = kein einziger Blick aufs Display |

**Nach M7 evaluieren, nicht vorher:** native App mit Geofence, weitere CPO-Abos über Mobilithek, Kalenderanbindung.

## 11. Risiken

| Risiko | Schwere | Umgang |
|---|---|---|
| Google ändert URL-Struktur | hoch | Manueller Fallback ist Pflichtfeature, nicht optional |
| Realtime-Daten der CPOs unzuverlässig | hoch | Zeitstempel immer anzeigen, nie Verfügbarkeit behaupten |
| Mobilithek-Onboarding zäh | mittel | MobiData BW zum Entwickeln, DE-weit später |
| Push zu früh bei Stau | niedrig | Directions-API + 1-2 Pings; Restfehler akzeptiert |
| Kurzbefehl unzuverlässig | mittel | Bei M3 früh im Alltag testen |
| "Mitteilungen ankündigen" liest den Push nicht vor | **hoch** | Früh in M6 verifizieren. Fällt es aus, bricht das Freihand-Konzept — Fallback wäre Zustellung als iMessage an sich selbst |
| Siri erkennt die Kurzbefehl-Namen schlecht | mittel | Kurze, eindeutige Namen; im Alltag nachschärfen |
| Directions-API-Kontingent / Kosten | niedrig | 2-3 Calls pro Fahrt, n=1; Limit im Backend hart setzen |

## 12. Repo-Setup

```
ladeplanner/
├── README.md
├── docs/
│   └── konzept.md              ← dieses Dokument
├── src/
│   ├── app/api/                # Next.js Routes
│   ├── lib/resolver/           # Share-URL-Auflösung
│   ├── lib/chargers/           # Suche + Ranking
│   ├── lib/realtime/           # OCPI/DATEX II Clients
│   └── lib/notify/             # ntfy
├── prisma/schema.prisma
├── tests/fixtures/share-urls/  # echte URLs, anonymisiert
└── .github/workflows/ci.yml
```

**Erste Aufgabe für Claude Code:**
1. Repo `ladeplanner` auf GitHub anlegen (privat)
2. Next.js + TypeScript + Prisma scaffolden, dieses Dokument nach `docs/`
3. CI-Workflow: Lint, Typecheck, Vitest
4. M1 umsetzen — Resolver mit allen drei Stufen und Tests

---

## Anhang: Verworfene Ansätze

- **Kalender als Trigger.** Kalendereinträge tragen die Uhrzeit des Termins, nicht der Abfahrt ("Hotel Hamburg, 20 Uhr"). Als Zeitquelle unbrauchbar. Höchstens als Adressquelle in Phase 2.
- **Hubject/Gireve.** Kommerzielle Verträge im vierstelligen Bereich pro Monat. Durch AFIR obsolet.
- **Google Maps Navigationsziel direkt auslesen.** Google Maps teilt sein aktives Ziel nicht mit anderen Apps. Kein Weg vorbei am Share Sheet.
- **Eigene Routenplanung.** ABRP kennt Ladekurven und Verbrauchsmodelle. Nicht nachbauen.
- **Googles laufende ETA auslesen.** Google Maps gibt sie nicht heraus. Ersatz: Directions API mit demselben Verkehrsmodell (6.3).
- **Selbststartender Kurzbefehl zum berechneten Zeitpunkt.** Gibt es unter iOS nicht — Automationen brauchen einen echten Trigger. Ersatz: serverseitig geplanter Push (6.4).
- **Dauerhaftes Geofencing / Hintergrundortung.** Akkukosten und native App nötig. Ersatz: 1-2 Pings (6.5).
- **Push zum Antippen während der Fahrt.** § 23 Abs. 1a StVO. Ersatz: Vorlesen plus Sprachbefehl (6.6).
