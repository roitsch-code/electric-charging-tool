/**
 * Die App taktet sich selbst — ein Durchlauf pro Minute, im Server-Prozess.
 *
 * Vorher hing jeder Push an einer Kette aus drei Teilen außerhalb der App:
 * ofelia musste laufen, `docker exec` musste greifen, und der
 * Authorization-Header musste die INI-, Shell- und curl-Ebene unbeschadet
 * überstehen. Fällt davon etwas aus, passiert nichts — ohne dass die App
 * davon je erfährt. Für ein n=1-Projekt ist das drei Teile zu viel.
 *
 * Next ruft `register()` einmal beim Serverstart auf (Next 15, stabil).
 * `/api/cron/dispatch` bleibt zusätzlich erreichbar; doppelte Läufe sind
 * harmlos, weil jeder Push über eine eigene Spalte abgesichert ist
 * (`start_push_at`, `diversions`, `notified_at`).
 */

const TAKT_MS = 60_000;

export async function register() {
  // Nur im Node-Server, nicht in der Edge-Runtime (dort gibt es kein Prisma).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Beim Build lädt Next die Instrumentierung ebenfalls — dort nichts starten.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.LADEPLANNER_INTERNAL_CRON === "0") return;

  const { runDispatch } = await import("@/lib/notify/dispatch");

  let laeuft = false;
  const tick = async () => {
    // Überlappung vermeiden: Ein Durchlauf kann bei langsamer TomTom-Antwort
    // länger als eine Minute dauern.
    if (laeuft) return;
    laeuft = true;
    try {
      const r = await runDispatch();
      if (!r.ok) console.warn("[ladeplanner] Durchlauf ohne Ergebnis:", r.error);
    } catch (e) {
      // Der nächste Tick versucht es erneut; der Grund landet über
      // recordBeat/last_error in der Diagnose — und hier im Container-Log.
      console.warn("[ladeplanner] Durchlauf fehlgeschlagen:", e);
    } finally {
      laeuft = false;
    }
  };

  console.log(`[ladeplanner] interner Minutentakt aktiv (${TAKT_MS / 1000}s)`);
  const timer = setInterval(tick, TAKT_MS);
  // Der Timer darf den Prozess nicht am Leben halten (sauberes Herunterfahren).
  timer.unref?.();
  // Einmal kurz nach dem Start, damit ein Neustart mitten im Fenster nicht
  // eine volle Minute verliert.
  setTimeout(tick, 5_000).unref?.();
}
