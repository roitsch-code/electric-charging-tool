# Share-URL-Fixtures

Reale, **anonymisierte** Google-Maps-URL-Formen fuer die Resolver-Tests
(Konzept §4, §12). Kein API-Key, keine personenbezogenen Orte — nur die
Struktur, auf die der Resolver reagieren muss.

- `resolved-urls.json` — bereits aufgeloeste (finale) Google-Maps-URLs mit
  erwartetem Parse-Ergebnis. Testet Stufe 1 (Koordinaten-Regex) und die
  Namens-Extraktion fuer Stufe 2, ohne Netz.
- `redirects.json` — `maps.app.goo.gl`-Kurz-URL -> finale URL. Fuettert den
  injizierten `followUrl` im Orchestrator-Test.

**Wenn Google die URL-Struktur aendert** (Risiko §11, hoch): Neue reale
URL hier als Fixture ergaenzen, Test faellt rot, Regex in
`extractCoordinates.ts` / `extractPlaceName.ts` nachziehen. Der manuelle
Fallback (Stufe 3) faengt die Luecke bis dahin ab.
