import { prisma } from "@/lib/db";

/**
 * Herzschlag der Cron-Läufe.
 *
 * Ohne diesen Nachweis lässt sich nach einer Fahrt ohne Push nicht sagen, ob
 * der Minuten-Cron überhaupt gefeuert hat: ofelia führt `docker exec` aus,
 * ein fehlgeschlagener Aufruf (401 wegen `CRON_SECRET`, kaputtes Quoting,
 * Container neu gestartet) hinterlässt in der App keine Spur. Ein Eintrag pro
 * Job — überschrieben, nicht angehängt — kostet eine Zeile und beantwortet
 * genau diese Frage.
 *
 * Tabelle wird wie `city_rules`/`trip_watch` selbst angelegt (idempotent,
 * prozessweit gecacht), damit der Auto-Deploy keinen Migrationslauf braucht.
 */

export type BeatJob = "dispatch" | "watch";

export interface Beat {
  job: string;
  lastRunAt: Date;
  ok: boolean;
  detail: string | null;
  runs: number;
  /** Zuletzt abgewiesener Aufruf (falsches/fehlendes CRON_SECRET). */
  lastDeniedAt: Date | null;
}

let tableReady: Promise<void> | null = null;

export function ensureCronBeatTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "cron_beat" (
          "job"            TEXT NOT NULL,
          "last_run_at"    TIMESTAMP(3) NOT NULL,
          "ok"             BOOLEAN NOT NULL DEFAULT true,
          "detail"         TEXT,
          "runs"           INTEGER NOT NULL DEFAULT 0,
          "last_denied_at" TIMESTAMP(3),
          CONSTRAINT "cron_beat_pkey" PRIMARY KEY ("job")
        )
      `);
    })().catch((e) => {
      tableReady = null;
      throw e;
    });
  }
  return tableReady;
}

/**
 * Einen Lauf vermerken. Schluckt eigene Fehler bewusst: Der Herzschlag ist
 * Diagnose, er darf den Push-Versand nie verhindern.
 */
export async function recordBeat(
  job: BeatJob,
  ok: boolean,
  detail: string | null = null,
  now = new Date(),
): Promise<void> {
  try {
    await ensureCronBeatTable();
    await prisma.$executeRaw`
      INSERT INTO cron_beat (job, last_run_at, ok, detail, runs)
      VALUES (${job}, ${now}, ${ok}, ${detail}, 1)
      ON CONFLICT (job) DO UPDATE SET
        last_run_at = EXCLUDED.last_run_at,
        ok = EXCLUDED.ok,
        detail = EXCLUDED.detail,
        runs = cron_beat.runs + 1
    `;
  } catch {
    /* Diagnose darf nichts kaputt machen */
  }
}

/**
 * Einen abgewiesenen Aufruf vermerken (401). Nur der Zeitstempel, kein
 * Zähler — sonst könnte ein fremder Aufrufer die Tabelle als Zählwerk
 * missbrauchen. Genau dieser Fall ist sonst unsichtbar: Der Cron feuert,
 * die App weist ihn ab, und niemand erfährt davon.
 */
export async function recordDenied(job: BeatJob, now = new Date()): Promise<void> {
  try {
    await ensureCronBeatTable();
    await prisma.$executeRaw`
      INSERT INTO cron_beat (job, last_run_at, ok, detail, runs, last_denied_at)
      VALUES (${job}, ${now}, false, 'unauthorized', 0, ${now})
      ON CONFLICT (job) DO UPDATE SET last_denied_at = ${now}
    `;
  } catch {
    /* siehe oben */
  }
}

/** Alle Herzschläge, für die Diagnose. Fehlt die Tabelle: leere Liste. */
export async function readBeats(): Promise<Beat[]> {
  try {
    await ensureCronBeatTable();
    const rows = await prisma.$queryRaw<
      {
        job: string;
        last_run_at: Date;
        ok: boolean;
        detail: string | null;
        runs: number;
        last_denied_at: Date | null;
      }[]
    >`SELECT job, last_run_at, ok, detail, runs, last_denied_at FROM cron_beat ORDER BY job ASC`;
    return rows.map((r) => ({
      job: r.job,
      lastRunAt: r.last_run_at,
      ok: r.ok,
      detail: r.detail,
      runs: r.runs,
      lastDeniedAt: r.last_denied_at,
    }));
  } catch {
    return [];
  }
}
