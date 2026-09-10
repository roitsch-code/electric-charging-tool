import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readBeats } from "@/lib/notify/beat";
import { befund, type DiagWatch } from "@/lib/notify/diagnose";
import { pushTransport } from "@/lib/notify/send";
import { ensureTripWatchTable } from "@/lib/notify/watch-db";
import { assertCron } from "../../cron/guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/notify/diag — warum kam (kein) Push?
 *
 * Beantwortet in einem Aufruf die vier Fragen, die nach einer Fahrt ohne Push
 * offen bleiben: Ist ein Versandweg eingerichtet? Hat der Minuten-Cron
 * gefeuert? Wurde die Säule überhaupt geprüft — wie oft, mit welchem Ergebnis?
 * Und ging ein Push raus?
 *
 * Geschützt wie die Cron-Endpunkte über CRON_SECRET. Reine Lesesicht, kein
 * Push, kein API-Kontingent.
 *
 *   docker exec ladeplanner-app node -e "fetch('http://localhost:3000/api/notify/diag',{headers:{Authorization:'Bearer '+(process.env.CRON_SECRET||'')}}).then(r=>r.json()).then(d=>console.log(JSON.stringify(d,null,2)))"
 */
export async function GET(request: Request) {
  // Ohne Secret wird NICHT abgewiesen, sondern anonymisiert geantwortet: Der
  // Befund ist genau dann nützlich, wenn man unterwegs ist und kein Terminal
  // hat. Preisgegeben werden nur Ja/Nein-Fakten und Zeitstempel — keine Namen
  // von Säulen oder Zielen, keine Koordinaten, keine Schlüssel.
  const anonym = assertCron(request) !== null;

  const now = new Date();
  const beats = await readBeats();

  let watches: DiagWatch[] = [];
  let tabelle = true;
  try {
    await ensureTripWatchTable();
    const rows = await prisma.$queryRaw<
      {
        trip_id: string;
        name: string;
        watch_from: Date;
        watch_until: Date;
        checks: number;
        checked_at: Date | null;
        start_push_at: Date | null;
        diversions: number;
        last_reason: string | null;
        last_error: string | null;
        done_at: Date | null;
        done_reason: string | null;
        status: string;
        free: number | null;
        total: number | null;
      }[]
    >`
      SELECT trip_id, name, watch_from, watch_until, checks, checked_at, start_push_at,
             diversions, last_reason, last_error, done_at, done_reason, status, free, total
      FROM trip_watch
      ORDER BY watch_from DESC
      LIMIT 5
    `;
    watches = rows.map((r) => ({
      tripId: r.trip_id,
      name: r.name,
      watchFrom: r.watch_from,
      watchUntil: r.watch_until,
      checks: r.checks,
      checkedAt: r.checked_at,
      startPushAt: r.start_push_at,
      diversions: r.diversions,
      lastReason: r.last_reason,
      lastError: r.last_error,
      doneAt: r.done_at,
      doneReason: r.done_reason,
    }));
  } catch {
    tabelle = false;
  }

  const transport = pushTransport();

  return NextResponse.json({
    ok: true,
    zeit: now.toLocaleString("de-DE", { timeZone: "Europe/Berlin" }),
    // Das Wichtigste zuerst: der Befund in Worten.
    befund: befund({ now, transport, beats, watches, anonym }),
    versandweg: {
      via: transport,
      telegramToken: !!process.env.TELEGRAM_BOT_TOKEN,
      telegramChat: !!process.env.TELEGRAM_CHAT_ID,
      ntfyTopic: !!process.env.NTFY_TOPIC,
      cronSecret: !!process.env.CRON_SECRET,
    },
    quelle: process.env.TOMTOM_API_KEY ? "tomtom" : (process.env.CHARGER_SOURCE ?? "seed"),
    cron: beats.map((b) => ({
      job: b.job,
      zuletzt: b.lastRunAt.toISOString(),
      ok: b.ok,
      detail: b.detail,
      laeufe: b.runs,
      abgewiesen: b.lastDeniedAt?.toISOString() ?? null,
    })),
    tabelle,
    // Die Rohdaten (mit Namen und Zielen) nur bei autorisiertem Aufruf.
    ueberwachung: anonym ? undefined : watches,
  });
}
