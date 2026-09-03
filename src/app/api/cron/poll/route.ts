import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchMobidataRealtime } from "@/lib/realtime/mobidata";
import { upsertStatuses } from "@/lib/realtime/status-upsert";
import { assertCron } from "../guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/poll  (Vercel Cron, Konzept §6)
 * Holt den MobiData-BW-Realtime-Feed und schreibt die Verfuegbarkeit in die
 * DB. Nur Statuswerte zu bereits importierten Ladepunkten (§5.1).
 */
export async function GET(request: Request) {
  const denied = assertCron(request);
  if (denied) return denied;

  try {
    const records = await fetchMobidataRealtime();
    const { updated, skipped } = await upsertStatuses(prisma, records);
    return NextResponse.json({
      ok: true,
      fetched: records.length,
      updated,
      skipped,
      at: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "poll-failed" },
      { status: 502 },
    );
  }
}
