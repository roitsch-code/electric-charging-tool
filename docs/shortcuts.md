# iOS-Kurzbefehle & Push-Einrichtung

Praktische Anleitung für die iPhone-Seite (Konzept §3, §6). Was **heute schon
funktioniert** ist markiert; die trip-gebundenen Befehle brauchen die
Trigger-Endpunkte aus **M5** und sind entsprechend gekennzeichnet.

> Hinweis: iOS ändert Menübezeichnungen zwischen Versionen. Wo unten ein
> Schalter genannt wird, kann er anders heißen — such im **Detailscreen des
> Kurzbefehls** (Info-/Einstellungssymbol) nach dem sinngemäßen Eintrag. Die
> **Aktionsnamen** (z. B. „Inhalte von URL abrufen") sind stabil und lassen
> sich in der Aktionssuche der Kurzbefehle-App finden.

Ersetze in allen URLs `https://DEINE-APP.vercel.app` durch deine echte
Vercel-Domain.

---

## 1. Push über ntfy einrichten ✅ (heute)

1. **ntfy-App** aus dem App Store installieren.
2. In der App ein **Topic abonnieren** — einen schwer zu erratenden Namen
   wählen, z. B. `ladeplanner-markus-7f3q`. Genau dieser Name kommt später als
   `NTFY_TOPIC` in die Vercel-Umgebungsvariablen.
3. **Vorlesen aktivieren** (Konzept §6.6): iOS-Einstellungen →
   *Mitteilungen* → *Mitteilungen ankündigen* → **ntfy** einschalten. Dann
   liest Siri über CarPlay/AirPods den Nachrichtentext vor.
4. Test: im Browser
   `curl -d "Ladeplanner: Test, elf Kilowatt. Reicht über Nacht." ntfy.sh/DEIN-TOPIC`
   — die Mitteilung muss auf dem iPhone ankommen (und vorgelesen werden, wenn
   Ankündigen aktiv ist).

**Risiko-Check (Konzept §11, hoch):** Wenn „Mitteilungen ankündigen" den Text
*nicht* vorliest, kippt das Freihand-Konzept. Genau das hier zuerst prüfen.

---

## 2. Kurzbefehl „Ladeplanner" (Share Sheet) ✅ (heute, GET-Variante)

Zweck: Ziel aus Google Maps teilen → sofort Top-3-Ergebnis (Konzept §3, Phase 1).

**Aktionen (in dieser Reihenfolge):**

1. **Kurzbefehl empfängt** → Typ *URLs* (im Detailscreen einstellen, damit er
   im Teilen-Menü erscheint).
2. Aktion **„Menü anzeigen"** mit vier Einträgen: `Kurz`, `Paar Stunden`,
   `Über Nacht`, `Länger`.
3. Je Menüzweig eine **Textvariable** `dwell` setzen: `kurz` / `paar` /
   `nacht` / `laenger`.
4. Aktion **„Menü anzeigen"** für die Rückfahrt: `Direkt zurück` /
   `Bleibe länger`. Bei „Direkt zurück" eine Textvariable `return` z. B. auf
   `300` setzen, sonst leer lassen.
5. Aktion **„URL"** bauen:
   `https://DEINE-APP.vercel.app/plan?u=[Geteilte URL]&dwell=[dwell]&return=[return]`
   (die geteilte Maps-URL ist die Kurzbefehl-Eingabe).
6. Aktion **„URLs öffnen"** → zeigt die Ergebnisseite mit Ansage-Vorschau und
   den beiden Google-Maps-Deeplinks.

Damit läuft der komplette Fluss **ohne Backend-Trip**: Der Resolver löst die
`maps.app.goo.gl`-URL auf, das Ranking läuft, die Seite zeigt Top 3.

**Variante „für später" (Push):** Statt `/plan` per **GET** die Route
`POST /api/destinations` mit JSON `{ "shareUrl": …, "dwellMinutes": …,
"returnTripKm": … }` aufrufen (Aktion „Inhalte von URL abrufen", Methode POST).
Legt einen Trip an; der Push kommt später über den Dispatch-Cron. Sinnvoll
zusammen mit der ETA-Berechnung aus **M5**.

---

## 3. Fahrtstart-Trigger ⏳ (M5)

Drei gleichwertige Wege (Konzept §6.4), alle rufen `POST /api/trips/current/start`:

- **CarPlay verbunden** → persönliche Automation (läuft ohne Bestätigung).
- **Bluetooth zur Freisprechanlage** → persönliche Automation.
- **„Hey Siri, Ladeplanner starten"** → Sprachbefehl (Primärweg, funktioniert
  immer, auch als Beifahrer).

> Der Endpunkt `/api/trips/current/start` wird in **M5** gebaut (verankert die
> ETA). Bis dahin die Automationen anlegen, aber noch nicht scharf schalten.

---

## 4. Reaktions-Befehle ⏳ (M5/M6)

Zustandslose Sprachbefehle, jeder ruft `GET /api/trips/current/recommendation`
und handelt danach (Konzept §6.6):

- **„Hey Siri, Ladeplanner umleiten"** → öffnet Google Maps zur empfohlenen
  Ladesäule (`driveUrl`).
- **„Hey Siri, Ladeplanner Alternative"** → liest die nächstbeste Option vor.
- **„Hey Siri, Ladeplanner zum Ziel"** → Fußweg-Navigation ab Ladepunkt
  (`walkUrl`).

Die Deeplinks liefert schon heute `/api/plan` pro Ladepunkt (`driveUrl` /
`walkUrl`); es fehlt nur der „aktueller Trip"-Endpunkt aus **M5**.

---

## Zusammengefasst: was heute testbar ist

| Schritt | Status |
|---|---|
| ntfy abonnieren + Vorlesen prüfen | ✅ |
| Share-Sheet-Kurzbefehl → `/plan` (Ergebnis im Browser) | ✅ |
| Realtime-Verfügbarkeit (MobiData BW) | ✅ (nach DB-Import) |
| Push zum Zeitpunkt (Dispatch-Cron) | ⏳ braucht Trip + ETA (M5) |
| Fahrtstart-/Reaktions-Befehle | ⏳ M5/M6 |
