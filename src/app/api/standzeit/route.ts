import { NextResponse } from "next/server";
import { cityStandzeit } from "@/lib/rules/standzeit";
import { getSavedRule, saveRule } from "@/lib/rules/standzeit-db";
import { researchStandzeit } from "@/lib/rules/standzeit-research";

export const dynamic = "force-dynamic";
// Websuche + Modellantwort können dauern -> großzügiges Limit.
export const maxDuration = 60;

type Kind = "ac" | "dc";

function parseConnector(v: string | null): Kind | null {
  return v === "ac" || v === "dc" ? v : null;
}

/**
 * GET /api/standzeit?city=..&connector=ac|dc
 * Löst die Standzeit-Regel auf: kuratiertes Regelwerk ∪ gespeicherte Recherche.
 * Recherchiert NICHT (kein Modellaufruf) — nur Nachschlagen.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const city = (searchParams.get("city") ?? "").trim();
  const connector = parseConnector(searchParams.get("connector"));
  if (!city || !connector) {
    return NextResponse.json({ found: false, reason: "city/connector fehlt" }, { status: 400 });
  }

  const stat = cityStandzeit(city, connector);
  if (stat) {
    return NextResponse.json({ found: true, source: "kuratiert", origin: "static", ...stat });
  }
  const saved = await getSavedRule(city, connector);
  if (saved) {
    return NextResponse.json({ found: true, origin: "db", ...saved });
  }
  return NextResponse.json({ found: false, city, connector });
}

/**
 * POST /api/standzeit   Body: { city, connector }
 * „Suche Standzeit": kuratiert -> DB -> Recherche (Claude + Websuche). Ein
 * neu recherchiertes Ergebnis wird nur bei belegter Quelle gespeichert.
 */
export async function POST(request: Request) {
  let body: { city?: unknown; connector?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ found: false, reason: "ungültiger Body" }, { status: 400 });
  }
  const city = typeof body.city === "string" ? body.city.trim() : "";
  const connector = parseConnector(typeof body.connector === "string" ? body.connector : null);
  if (!city || !connector) {
    return NextResponse.json({ found: false, reason: "city/connector fehlt" }, { status: 400 });
  }

  // 1) Kuratiertes Regelwerk (sofort, ohne Kosten).
  const stat = cityStandzeit(city, connector);
  if (stat) {
    return NextResponse.json({ found: true, source: "kuratiert", origin: "static", ...stat });
  }

  // 2) Bereits recherchiert & gespeichert?
  const saved = await getSavedRule(city, connector);
  if (saved) {
    return NextResponse.json({ found: true, origin: "db", ...saved });
  }

  // 3) Ohne API-Key keine Recherche — ehrlich melden.
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { found: false, reason: "Recherche nicht konfiguriert (ANTHROPIC_API_KEY fehlt)" },
      { status: 503 },
    );
  }

  // 4) Recherchieren und (nur bei belegter Quelle) speichern.
  const res = await researchStandzeit(city, connector);
  if (!res.found) {
    return NextResponse.json({ city, connector, ...res });
  }
  try {
    await saveRule({
      city,
      connector,
      label: res.label,
      verdict: res.verdict,
      source: res.source,
      note: res.note,
    });
  } catch {
    // Speichern fehlgeschlagen -> Ergebnis trotzdem zurückgeben (nicht verlieren).
  }
  return NextResponse.json({ origin: "research", ...res });
}
