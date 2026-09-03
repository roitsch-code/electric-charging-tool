import { NextResponse } from "next/server";

/**
 * Optionaler Schutz fuer Cron-Endpunkte. Ist CRON_SECRET gesetzt, muss der
 * Aufruf `Authorization: Bearer <secret>` mitbringen (Vercel Cron kann das).
 * Ohne gesetztes Secret bleibt der Endpunkt offen (Dev/n=1).
 */
export function assertCron(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
