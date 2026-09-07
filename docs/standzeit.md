# Standzeit — die geschlossene Lücke

> *„Ich muss doch wissen, **bevor** ich dahin fahre, wie lange ich da stehen
> DARF."*

Das ist die Lücke, um die es hier geht — und wie der Ladeplanner sie stopft.

## Drei Fragen beim Laden am Ziel — die dritte war offen

Laden am Zielort zerfällt in drei Fragen:

1. **Wo ist ein Ladepunkt in Gehdistanz?** → gelöst über eine echte, DE-weite
   Live-Quelle (TomTom EV API) + Umkreissuche.
2. **Ist er gerade frei und schnell genug?** → gelöst über Live-Belegung +
   ein nähe-/bedarfsgewichtetes Ranking.
3. **Wie lange darf ich dort überhaupt stehen?** → **war offen.**

Frage 3 ist keine Kür. Wer mit dem E-Auto zum Ziel fährt, muss vorher wissen,
ob die Säule „nur während des Ladevorgangs", „max. 2 Std mit Parkscheibe" oder
„nachts frei" ist — sonst plant man blind und riskiert ein Knöllchen oder eine
Blockiergebühr.

## Warum die Lücke existiert

**Es gibt keine bundesweite Datenquelle für die Höchstparkdauer an Ladesäulen.**

- Ladepunkt-Register (BNetzA, TomTom, OCM) kennen Position, Leistung, Stecker,
  teils Belegung — **aber keine Parkregel**.
- Die Regel steht **auf dem Schild** und wird **je Kommune** festgelegt
  (StVO Zeichen 314 „Parken" + Zusatzzeichen, z. B. „E-Kfz während des
  Ladevorgangs", „Mo–Fr 9–20 h max. 3 Std", „mit Parkscheibe").
- Manche Städte veröffentlichen das online, viele nur verstreut (Ratsbeschluss,
  Stadtwerke-FAQ, Parkgebühren­ordnung), manche gar nicht.

Es gibt also nichts zum „Herunterladen". Die Lücke lässt sich nur **Kommune für
Kommune** schließen.

## Die Lösung: zwei Ebenen

```mermaid
flowchart TD
    A[Ladepunkt in der Ergebnisliste] --> B{Kuratiertes Regelwerk<br/>kennt die Stadt?}
    B -- ja --> C[Regel sofort anzeigen<br/>Quelle: kuratiert]
    B -- nein --> D{Schon einmal<br/>recherchiert? city_rules-DB}
    D -- ja --> E[Gespeicherte Regel anzeigen<br/>Quelle: recherchiert]
    D -- nein --> F[Knopf „Suche Standzeit"]
    F --> G[Agent: Claude + Websuche]
    G --> H{Belastbare Regel<br/>MIT Quelle gefunden?}
    H -- ja --> I[Anzeigen + in DB speichern]
    H -- nein --> J[Ehrlich: „laut Schild vor Ort"<br/>nichts gespeichert]
```

### Ebene 1 — kuratiertes Regelwerk (sofort, geprüft)

`src/lib/rules/standzeit.ts` enthält pro Stadt eine recherchierte Regel für
AC/DC, jeweils mit Quelle im Kommentar. Ausgabeformat ist bewusst **konkret mit
Uhrzeitfenster** — nicht „Nachts frei", sondern:

| Stadt | AC | DC | Quelle |
|---|---|---|---|
| Düsseldorf | Max. 4 Std · 21–9 Uhr frei | Max. 1 Std · 21–9 Uhr frei | SWD / Stadt |
| Hamburg | Max. 3 Std (9–20 Uhr) · 20–9 Uhr frei | Max. 1 Std (9–20 Uhr) · 20–9 Uhr frei | hamburg.de |
| Köln | Max. 4 Std (9–21 Uhr) · 21–9 Uhr frei | Max. 1 Std (9–21 Uhr) · 21–9 Uhr frei | stadt-koeln.de |
| Aachen | Max. 2 Std (7–21 Uhr) · 21–7 Uhr frei | Max. 1 Std (7–21 Uhr) · 21–7 Uhr frei | aachen.de / STAWAG |
| Emmerich am Rhein | Max. 2 Std mit Parkscheibe (Mo–Sa tags) · abends/nachts frei | (wie AC) | emmerich.de |

Die Stadt wird aus der **Poststadt der Adresse** abgeleitet
(`cityFromAddress`) — nicht aus TomToms `municipality`, das teils ein Stadtteil
ist (z. B. „Ehrenfeld" statt „Köln").

### Ebene 2 — On-Demand-Recherche (der „Suche Standzeit"-Knopf)

Für jede nicht kuratierte Stadt erscheint auf der Ergebnis-Karte der Knopf
**„Suche Standzeit"**. Ein Klick:

1. prüft erneut Regelwerk und DB (Kosten vermeiden),
2. lässt sonst **Claude mit Websuche** die kommunale Regel recherchieren
   (`standzeit-research.ts`, Server-Tool `web_search`),
3. zeigt das Ergebnis **mit Quelle-Link** an und **speichert** es in der
   selbst-anlegenden Tabelle `city_rules` (`standzeit-db.ts`).

Beim nächsten Mal ist die Regel sofort da — ohne erneuten Modellaufruf.

## Kein Erfinden — der Halluzinations-Schutz

Eine Parkregel zu erfinden wäre schlimmer als keine zu haben. Darum:

- Gespeichert/angezeigt wird eine recherchierte Regel **nur**, wenn die
  Antwort ein Ergebnis **mit echter Quelle-URL** (`https://…`) **und** ein
  Label liefert (`found === true`).
- Findet der Agent nichts Belastbares, kommt ehrlich **„Keine belastbare Regel
  gefunden — Höchstparkdauer laut Schild vor Ort"** — und es wird **nichts**
  gespeichert.
- Ohne `ANTHROPIC_API_KEY` bleibt der Knopf inaktiv; die App läuft normal
  weiter und zeigt den ehrlichen Hinweis.

Auch die kuratierten Einträge sind belegt (Quelle im Code-Kommentar) und, wo
die Datenlage dünn ist (Emmerich), **transparent konservativ** hergeleitet
statt präzise erfunden.

## Erweitern

- **Stadt fest hinterlegen:** einen Eintrag in `CITY_RULES`
  (`src/lib/rules/standzeit.ts`) ergänzen — Label im Format
  `Max. X Std (Fenster) · frei-Fenster`, `verdict` (`free`/`limited`/…) und die
  Quelle als Kommentar. Test in `tests/rules/standzeit.test.ts` mitziehen.
- **Oder einfach den Knopf drücken** — die Recherche erledigt und speichert es.

## API

```
GET  /api/standzeit?city=<Stadt>&connector=ac|dc
     → { found, origin: "static"|"db", label, verdict, source?, note? }

POST /api/standzeit   Body: { city, connector }
     kuratiert → DB → Recherche; speichert bei belegter Quelle.
     → { found, origin: "static"|"db"|"research", label, verdict, source?, note? }
     503, wenn ANTHROPIC_API_KEY fehlt.
```

## Ehrliche Grenzen

- Kommunale Regeln ändern sich; recherchierte Einträge sind ein Stand, kein
  Abo. Bei Zweifel gilt das Schild vor Ort.
- Regeln sind hier **stadtweit** modelliert. Einzelne Standorte können abweichen
  (z. B. Marktzeiten-Sperrung, private Parkhäuser). Das Label ist die Regel,
  nicht das letzte Wort — dafür steht bewusst „laut Schild" im Fallback.
