import Link from "next/link";
import StartTripButton from "./StartTripButton";
import NightBadge from "./NightBadge";
import MiniMap from "./MiniMap";
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
  ac_ok: "Wechselstrom (11 kW) reicht — günstiger.",
  ac_or_dc: "Wechselstrom oder Gleichstrom passt.",
  dc_required: "Kurzer Halt / weite Rückfahrt — Schnelllader.",
};

const STATUS: Record<string, { label: string; color: string }> = {
  available: { label: "Frei", color: "var(--free)" },
  occupied: { label: "Belegt", color: "var(--busy)" },
  outoforder: { label: "Defekt", color: "var(--broken)" },
  unknown: { label: "Status unbekannt", color: "var(--unknown)" },
};

export default async function PlanPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const dest = await resolveDestination({
    lat: one(sp.lat), lng: one(sp.lng), u: one(sp.u), to: one(sp.to), q: one(sp.q), name: one(sp.name),
  });
  const input = parsePlanInput({ dwell: one(sp.dwell), return: one(sp.return) });

  return (
    <main className="wrap" style={{ minHeight: "100dvh" }}>
      <div className="bloom" style={{ top: 120, left: -70, width: 380, height: 300, opacity: 0.75 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
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
  const alternatives = plan.top.slice(1);
  const dwellLabel = input.dwellMinutes === null ? "" : input.dwellMinutes <= 60 ? "KURZ" : input.dwellMinutes <= 300 ? "2–3 STD" : "LANG";

  if (!best) {
    return (
      <>
        <div className="kicker">Ziel</div>
        <h1 className="display" style={{ fontSize: 26, fontWeight: 300, margin: "4px 0 0" }}>{coords.name ?? "Ziel"}</h1>
        <p style={{ color: "var(--muted)", fontSize: 15, marginTop: 20 }}>Keine Ladepunkte in Gehdistanz gefunden.</p>
      </>
    );
  }

  const c = best.charger;
  return (
    <>
      <div className="kicker">Ziel</div>
      <h1 className="display" style={{ fontSize: 26, fontWeight: 300, margin: "4px 0 0", lineHeight: 1.05 }}>{coords.name ?? "Ziel"}</h1>
      <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginTop: 6 }}>
        {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}{dwellLabel ? ` · ${dwellLabel}` : ""} · {DEMAND_LABEL[plan.demandClass]}
      </div>

      {!c.atDestination && (
        <div style={{ marginTop: 14 }}>
          <MiniMap dest={coords} charger={{ lat: c.lat, lng: c.lng }} walkingM={best.walkingM} />
        </div>
      )}

      <BestCard r={best} dest={coords} input={input} />

      {alternatives.length > 0 && (
        <>
          <div className="kicker" style={{ margin: "18px 2px 0" }}>Alternativen</div>
          {alternatives.map((r) => <AltRow key={r.charger.evseId} r={r} dest={coords} />)}
        </>
      )}

      <p className="mono" style={{ color: "var(--faint)", fontSize: 9.5, lineHeight: 1.55, marginTop: 14 }}>
        {plan.candidateCount} KANDIDAT(EN) · BELEGUNG LIVE (AFIR/TOMTOM) · STANDZEIT AUS OSM · GEHWEG GESCHÄTZT
      </p>
    </>
  );
}

function BestCard({ r, dest, input }: { r: RankedCharger; dest: { lat: number; lng: number; name?: string }; input: ReturnType<typeof parsePlanInput> }) {
  const c = r.charger;
  const st = STATUS[c.status ?? "unknown"] ?? STATUS.unknown!;
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 15px", borderBottom: "1px solid var(--line-2)" }}>
        <span className="kicker" style={{ color: "var(--muted)" }}>Beste Wahl</span>
        <span className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, color: st.color }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.color }} />{st.label}
        </span>
      </div>
      <div style={{ padding: 15 }}>
        <div style={{ fontSize: 19, fontWeight: 400 }}>{c.name}</div>
        <div className="metrics" style={{ marginTop: 12 }}>
          <div className="metric"><div className="v">{c.atDestination ? "0" : r.walkingM}<small> m</small></div><div className="k">{c.atDestination ? "am Ziel" : "Fußweg"}</div></div>
          <div className="metric"><div className="v">{r.usablePowerKw}<small> kW</small></div><div className="k">{c.connector === "dc" ? "Gleichstrom" : "Wechselstrom"}</div></div>
        </div>
        <div className="mono" style={{ fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--faint)", marginTop: 10 }}>
          {c.statusUpdatedAt ? `● Live · ${relTime(c.statusUpdatedAt)}` : "Keine Realtime-Daten"}
        </div>
        <NightBadge lat={c.lat} lng={c.lng} />
        <div style={{ display: "flex", gap: 9, marginTop: 13 }}>
          <StartTripButton destLat={dest.lat} destLng={dest.lng} destName={dest.name} dwellMinutes={input.dwellMinutes} returnTripKm={input.returnTripKm} />
          <a className="btn ghost icon" href={walkFromChargerUrl(c, dest)} aria-label="Fußweg zum Ziel">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="13" cy="4" r="1.8" /><path d="m8 21 3-7-3-2 1.5-5 3 3 3 1M7.5 13.5 6 21" /></svg>
          </a>
        </div>
      </div>
    </div>
  );
}

function AltRow({ r, dest }: { r: RankedCharger; dest: { lat: number; lng: number } }) {
  const c = r.charger;
  const st = STATUS[c.status ?? "unknown"] ?? STATUS.unknown!;
  return (
    <a className="row" href={walkFromChargerUrl(c, dest)} style={{ textDecoration: "none", padding: "12px 2px" }}>
      <span className="mono" style={{ fontSize: 11, color: "var(--faint)", width: 20, flex: "none" }}>{String(r.rank).padStart(2, "0")}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
        <span className="mono" style={{ display: "block", fontSize: 11, color: "var(--faint)", marginTop: 2 }}>
          {c.atDestination ? "AM ZIEL" : `${r.walkingM} M`} · {c.connector === "dc" ? "DC" : "AC"} · {r.usablePowerKw} KW
        </span>
      </span>
      <span className="mono" style={{ fontSize: 10.5, fontWeight: 600, color: st.color, textTransform: "uppercase" }}>{st.label}</span>
    </a>
  );
}

function ManualFallback({ hint, reason }: { hint?: string; reason?: string }) {
  return (
    <section>
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
  if (diffMin < 60) return `aktualisiert vor ${diffMin} min`;
  return `aktualisiert vor ${Math.round(diffMin / 60)} h`;
}
