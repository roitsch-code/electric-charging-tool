import { NextResponse } from "next/server";
import { runWatchTick } from "@/lib/notify/watch-tick";
import { assertCron } from "../guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/watch — Notification-Pusher einzeln ausloesen.
 *
 * Derselbe Durchlauf, den `/api/cron/dispatch` im Minutentakt ohnehin
 * mitmacht; hier separat fuer manuelle Pruefung auf dem Server:
 *
 *   docker exec ladeplanner-app node -e "fetch('http://localhost:3000/api/cron/watch').then(r=>r.json()).then(d=>console.log(JSON.stringify(d)))"
 */
export async function GET(request: Request) {
  const denied = assertCron(request);
  if (denied) return denied;
  const result = await runWatchTick();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
