import Link from "next/link";
import StartTripButton from "./StartTripButton";
import NightBadge from "./NightBadge";
import OptionsMap from "./OptionsMap";
import { planDestination, walkFromChargerUrl, type RankedCharger } from "@/lib/chargers";
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

const STATUS: Record<string, { label: string; color: string }> = {
  available: { label: "Frei", color: "var(--free)" },
  occupied: { label: "Belegt", color: "var(--busy)" },
  outoforder: { label: "Defekt", color: "var(--broken)" },
  unknown: { label: "Unbekannt", color: "var(--unknown)" },
};

export default async function PlanPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const dest = await resolveDestination({
    lat: one(sp.lat), lng: one(sp.lng), u: one(sp.u), to: one(sp.to), q: one(sp.q), name: one(sp.name),
  });
  const input = parsePlanInput({ dwell: one(sp.dwell), return: one(sp.return) });

  return (
    <main className="wrap" style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div className="bloom" style={{ top: 80, left: -80, width: 420, height: 340, opacity: 0.95 }} />
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
  const best = plan.top[0];
  const dwellLabel = input.dwellMinutes === null ? "" : input.dwellMinutes <= 60 ? "KURZ" : input.dwellMinutes <= 300 ? "2–3 STD" : "LANG";

  if (!best) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 0 }}>
        <div className="kicker">Ziel</div>
        <h1 className="display" style={{ fontSize: 26, fontWeight: 300, margin: "4px 0 0" }}>{coords.name ?? "Ziel"}</h1>
        <p style={{ color: "var(--muted)", fontSize: 15, marginTop: 16 }}>Keine Ladepunkte in Gehdistanz gefunden.</p>
      </div>
    );
  }

  const options = plan.top.map((r, i) => ({
    lat: r.charger.lat,
    lng: r.charger.lng,
    status: r.charger.status ?? "unknown",
    best: i === 0,
    walkingM: r.walkingM,
  }));

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, gap: 12 }}>
      <div style={{ flex: "none" }}>
        <div className="kicker">Ziel</div>
        <h1 className="display" style={{ fontSize: 23, fontWeight: 300, margin: "2px 0 0", lineHeight: 1.05, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{coords.name ?? "Ziel"}</h1>
        <div className="mono" style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 4 }}>
          {plan.candidateCount} OPTION(EN){dwellLabel ? ` · ${dwellLabel}` : ""} · {DEMAND_LABEL[plan.demandClass]}
        </div>
      </div>

      <div style={{ flex: "1 1 auto", minHeight: 140 }}>
        <OptionsMap dest={coords} options={options} />
      </div>

      <BestCard r={best} dest={coords} input={input} />
    </div>
  );
}

function BestCard({ r, dest, input }: { r: RankedCharger; dest: { lat: number; lng: number; name?: string }; input: ReturnType<typeof parsePlanInput> }) {
  const c = r.charger;
  const st = STATUS[c.status ?? "unknown"] ?? STATUS.unknown!;
  return (
    <div className="card" style={{ flex: "none" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 15px", borderBottom: "1px solid var(--line-2)" }}>
        <span style={{ fontSize: 15, fontWeight: 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginRight: 10 }}>{c.name}</span>
        <span className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, color: st.color, flex: "none" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.color }} />{st.label}
        </span>
      </div>
      <div style={{ padding: "12px 15px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14 }}>
          <div className="metrics">
            <div className="metric"><div className="v">{c.atDestination ? "0" : r.walkingM}<small> m</small></div><div className="k">{c.atDestination ? "am Ziel" : "Fußweg"}</div></div>
            <div className="metric"><div className="v">{r.usablePowerKw}<small> kW</small></div><div className="k">{c.connector === "dc" ? "Gleichstrom" : "Wechselstrom"}</div></div>
          </div>
          <div className="mono" style={{ fontSize: 9, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--faint)", textAlign: "right", paddingBottom: 4 }}>
            {c.statusUpdatedAt ? `● Live · ${relTime(c.statusUpdatedAt)}` : "Keine Realtime-Daten"}
          </div>
        </div>
        <NightBadge lat={c.lat} lng={c.lng} />
        <div style={{ display: "flex", gap: 9, marginTop: 12 }}>
          <StartTripButton destLat={dest.lat} destLng={dest.lng} destName={dest.name} dwellMinutes={input.dwellMinutes} returnTripKm={input.returnTripKm} />
          <a className="btn ghost icon" href={walkFromChargerUrl(c, dest)} aria-label="Fußweg zum Ziel">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="13" cy="4" r="1.8" /><path d="m8 21 3-7-3-2 1.5-5 3 3 3 1M7.5 13.5 6 21" /></svg>
          </a>
        </div>
      </div>
    </div>
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

function relTime(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "gerade aktualisiert";
  if (diffMin < 60) return `vor ${diffMin} min`;
  return `vor ${Math.round(diffMin / 60)} h`;
}
