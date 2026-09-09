import { NextResponse } from "next/server";
import { planDestination } from "@/lib/chargers";
import { seedSource } from "@/lib/chargers/seed";
import { buildDiversionMessage, pickAlternative } from "@/lib/notify/message";
import { pushTransport, sendPush } from "@/lib/notify/send";
import { assertCron } from "../../cron/guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/notify/test — schickt EINEN echten Ausweich-Push über den
 * eingerichteten Versandweg. Zum Prüfen der Zustellung und des Vorlesens im
 * Auto, ohne eine Fahrt anzulegen und ohne auf eine echte Belegung zu warten.
 *
 * Bewusst gegen die Seed-Daten (nicht TomTom): Der Test soll den VERSAND
 * prüfen, nicht die Datenquelle — so ist der Text immer derselbe und es
 * kostet kein API-Kontingent.
 *
 * Geschützt wie die Cron-Endpunkte über CRON_SECRET.
 */
export async function GET(request: Request) {
  const denied = assertCron(request);
  if (denied) return denied;

  const via = pushTransport();
  if (!via) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Kein Versandweg: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID oder NTFY_TOPIC setzen",
      },
      { status: 500 },
    );
  }

  const destination = { lat: 53.551, lng: 9.9215, name: "Gastwerk Hotel Hamburg" };
  const input = { dwellMinutes: 480, returnTripKm: null };
  const plan = await planDestination(destination, input, seedSource);
  const target = plan.top.find((r) => r.charger.status === "occupied")?.charger ?? plan.top[0]!.charger;
  const alternative = pickAlternative(plan, target);

  const msg = buildDiversionMessage(
    process.env.NTFY_TOPIC ?? "",
    { name: target.name, status: "occupied" },
    alternative,
    input,
    destination,
  );

  const result = await sendPush(msg);
  return NextResponse.json(
    {
      ok: result.ok,
      via: result.via,
      status: result.status,
      text: result.text,
      buttons: msg.actions?.map((a) => a.label) ?? [],
    },
    { status: result.ok ? 200 : 502 },
  );
}
