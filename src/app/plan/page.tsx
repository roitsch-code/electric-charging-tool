import Link from "next/link";
import ResultView, { type ViewCharger } from "./ResultView";
import { planDestination } from "@/lib/chargers";
import { getChargerSource } from "@/lib/chargers/source-factory";
import { getAvailabilityProvider } from "@/lib/availability";
import { parsePlanInput, resolveDestination } from "@/lib/planRequest";
import type { DemandClass } from "@/lib/vehicle";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

const DEMAND_LABEL: Record<DemandClass, string> = {
  ac_ok: "AC 11 kW reicht",
  ac_or_dc: "AC oder DC",
  dc_required: "Schnelllader",
};

export default async function PlanPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const dest = await resolveDestination({
    lat: one(sp.lat), lng: one(sp.lng), u: one(sp.u), to: one(sp.to), q: one(sp.q), name: one(sp.name),
  });
  const input = parsePlanInput({ dwell: one(sp.dwell), return: one(sp.return) });

  return (
    <main className="wrap" style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div className="bloom" style={{ top: -60, left: -70, width: 400, height: 320, opacity: 0.6 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flex: "none" }}>
        <Link href="/" className="glyph" aria-label="Zurück" style={{ color: "var(--fg)", width: 32, height: 32 }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
        </Link>
        <span className="mono" style={{ fontSize: 11, letterSpacing: "0.22em", color: "var(--faint)" }}>LADEPLANNER</span>
      </div>
      {!dest.ok || !dest.coords ? (
        <ManualFallback hint={dest.placeNameHint} reason={dest.reason} />
      ) : (
        <Result coords={dest.coords} input={input} />
      )}
    </main>
  );
}

async function Result({ coords, input }: { coords: { lat: number; lng: number; name?: string }; input: ReturnType<typeof parsePlanInput> }) {
  const plan = await planDestination(coords, input, getChargerSource(), getAvailabilityProvider());
  const dwellLabel = input.dwellMinutes === null ? "" : input.dwellMinutes <= 60 ? "KURZ" : input.dwellMinutes <= 300 ? "2–3 STD" : "LANG";

  if (plan.top.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 0 }}>
        <div className="kicker">Ziel</div>
        <h1 className="display" style={{ fontSize: 26, fontWeight: 300, margin: "4px 0 0" }}>{coords.name ?? "Ziel"}</h1>
        <p style={{ color: "var(--muted)", fontSize: 15, marginTop: 16 }}>Keine Ladepunkte in Gehdistanz gefunden.</p>
      </div>
    );
  }

  // Karte + Swipe zeigen Ziel und die Top-3-Optionen (Konzept: nicht überladen).
  const options: ViewCharger[] = plan.top.slice(0, 3).map((r) => ({
    evseId: r.charger.evseId,
    name: r.charger.name,
    lat: r.charger.lat,
    lng: r.charger.lng,
    status: r.charger.status ?? "unknown",
    connector: r.charger.connector,
    powerKw: r.charger.powerKw,
    usablePowerKw: r.usablePowerKw,
    walkingM: r.walkingM,
    atDestination: r.charger.atDestination ?? false,
    statusUpdatedAt: r.charger.statusUpdatedAt,
    totalPoints: r.charger.totalPoints ?? 1,
    // freePoints nur wenn bekannt; null = keine Live-Belegung (kein Fake).
    freePoints:
      r.charger.freePoints ??
      (r.charger.status === "available" ? 1 : r.charger.status === "occupied" || r.charger.status === "outoforder" ? 0 : null),
    standzeitLabel: r.charger.standzeitLabel ?? null,
    standzeitVerdict: r.charger.standzeitVerdict ?? null,
  }));

  return (
    <ResultView
      dest={coords}
      options={options}
      dwellLabel={dwellLabel}
      demandLabel={DEMAND_LABEL[plan.demandClass]}
      candidateCount={plan.candidateCount}
      dwellMinutes={input.dwellMinutes}
      returnTripKm={input.returnTripKm}
    />
  );
}

function ManualFallback({ hint, reason }: { hint?: string; reason?: string }) {
  return (
    <section style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 0 }}>
      <div className="kicker">Ziel manuell</div>
      <h1 className="display" style={{ fontSize: 24, fontWeight: 300, margin: "4px 0 10px" }}>Ziel eingeben</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.5 }}>Automatische Auflösung fehlgeschlagen ({reason ?? "unbekannt"}). Gib Adresse oder Ort direkt ein.</p>
      <form method="get" action="/plan" style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="field">
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="var(--faint)" strokeWidth="1.7" strokeLinecap="round"><path d="M20 10c0 5.5-8 11-8 11s-8-5.5-8-11a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="2.6" /></svg>
          <input name="to" defaultValue={hint ?? ""} placeholder="Adresse oder Ortsname" />
        </div>
        <button type="submit" className="btn">Planen</button>
      </form>
    </section>
  );
}
