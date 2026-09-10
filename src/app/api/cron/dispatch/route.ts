import { NextResponse } from "next/server";
import { runDispatch } from "@/lib/notify/dispatch";
import { recordDenied } from "@/lib/notify/beat";
import { assertCron } from "../guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/dispatch — ein Durchlauf von außen angestoßen.
 *
 * Der Durchlauf selbst steht in `lib/notify/dispatch.ts` und läuft im
 * Minutentakt von der App selbst (src/instrumentation.ts). Dieser Endpunkt
 * bleibt für den externen Cron (ofelia) und zum Prüfen von Hand.
 */
export async function GET(request: Request) {
  const denied = assertCron(request);
  if (denied) {
    // Abgewiesene Aufrufe festhalten: Ein Cron, der wegen falschem
    // CRON_SECRET auf 401 läuft, sieht sonst genauso aus wie gar kein Cron.
    await recordDenied("dispatch");
    return denied;
  }

  const result = await runDispatch();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
