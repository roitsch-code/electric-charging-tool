import Link from "next/link";
import StartTripButton from "./StartTripButton";
import {
  planDestination,
  walkFromChargerUrl,
  type RankedCharger,
} from "@/lib/chargers";
import { getChargerSource } from "@/lib/chargers/source-factory";
import { getAvailabilityProvider } from "@/lib/availability";
import { parsePlanInput, resolveDestination } from "@/lib/planRequest";
import type { DemandClass } from "@/lib/vehicle";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

const DEMAND_LABEL: Record<DemandClass, string> = {
  ac_ok: "Langer Aufenthalt — Wechselstrom (11 kW) reicht und ist günstiger.",
  ac_or_dc: "Mittlerer Aufenthalt — Wechselstrom oder Gleichstrom passt.",
  dc_required: "Kurzer Halt oder weite Rückfahrt — Schnelllader nötig.",
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
    lat: one(sp.lat), lng: one(sp.lng), u: one(sp.u),
    to: one(sp.to), q: one(sp.q), name: one(sp.name),
  });
  const input = parsePlanInput({ dwell: one(sp.dwell), return: one(sp.return) });

  return (
    <main className="wrap" style={{ minHeight: "100dvh" }}>
      <div className="bloom" style={{ top: 150, left: -60, width: 420, height: 340, opacity: 0.8 }} />
      <TopBar />
      {!dest.ok || !dest.coords ? (
        <ManualFallback hint={dest.placeNameHint} reason={dest.reason} />
      ) : (
        <Result coords={dest.coords} input={input} />
      )}
    </main>
  );
}

function TopBar() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
      <Link href="/" className="glyph" aria-label="Zurück" style={{ color: "var(--fg)" }}>
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
      </Link>
      <span className="mono" style={{ fontSize: 11, letterSpacing: "0.22em", color: "var(--faint)" }}>LADEPLANNER</span>
    </div>
  );
}

async function Result({
  coords, input,
}: {
  coords: { lat: number; lng: number; name?: string };
  input: ReturnType<typeof parsePlanInput>;
}) {
  const plan = await planDestination(coords, input, getChargerSource(), getAvailabilityProvider());
  const best = plan.top[0];
  const alternatives = plan.top.slice(1);
  const dwellLabel =
    input.dwellMinutes === null ? "" :
    input.dwellMinutes <= 60 ? "KURZ" :
    input.dwellMinutes <= 300 ? "2–3 STD" : "LANG";

  return (
    <>
      <div className="kicker">Ziel</div>
      <h1 className="display" style={{ fontSize: 28, fontWeight: 300, margin: "5px 0 0", lineHeight: 1.05 }}>
        {coords.name ?? "Ziel"}
      </h1>
      <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginTop: 8, letterSpacing: "0.02em" }}>
        {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}{dwellLabel ? ` · ${dwellLabel}` : ""}
      </div>

      <div style={{ display: "flex", gap: 11, alignItems: "flex-start", borderTop: "1px solid var(--line-2)", borderBottom: "1px solid var(--line-2)", padding: "14px 0", margin: "20px 0" }}>
        <span style={{ color: "var(--coral)", flex: "none", marginTop: 1 }}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></svg>
        </span>
        <span style={{ fontSize: 14, lineHeight: 1.45 }}>{DEMAND_LABEL[plan.demandClass]}</span>
      </div>

      {plan.expanded && (
        <p className="mono" style={{ color: "var(--busy)", fontSize: 11, marginBottom: 12 }}>
          NICHTS IN 500 M — UMKREIS AUF {plan.usedRadiusM} M ERWEITERT
        </p>
      )}

      {best ? (
        <>
          <BestCard r={best} dest={coords} input={input} />
          {alternatives.length > 0 && (
            <>
              <div className="kicker" style={{ margin: "24px 2px 2px" }}>Alternativen</div>
              {alternatives.map((r) => <AltRow key={r.charger.evseId} r={r} dest={coords} />)}
            </>
          )}
        </>
      ) : (
        <p style={{ color: "var(--muted)", fontSize: 15 }}>Keine Ladepunkte in Gehdistanz gefunden.</p>
      )}

      <p className="mono" style={{ color: "var(--faint)", fontSize: 10, lineHeight: 1.6, marginTop: 20 }}>
        {plan.candidateCount} KANDIDAT(EN) IM {plan.usedRadiusM}-M-UMKREIS · BELEGUNG LIVE (AFIR / TOMTOM) · GEHWEG GESCHÄTZT
      </p>
    </>
  );
}

function powerLabel(c: RankedCharger["charger"]) {
  return c.connector === "dc" ? "Gleichstrom" : "Wechselstrom";
}

function BestCard({ r, dest, input }: { r: RankedCharger; dest: { lat: number; lng: number; name?: string }; input: ReturnType<typeof parsePlanInput> }) {
  const c = r.charger;
  const st = STATUS[c.status ?? "unknown"] ?? STATUS.unknown!;
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: "1px solid var(--line-2)" }}>
        <span className="kicker" style={{ color: "var(--muted)" }}>Beste Wahl</span>
        <span className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, color: st.color }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.color }} />{st.label}
        </span>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 400 }}>{c.name}</div>
        <div className="metrics" style={{ marginTop: 14 }}>
          <div className="metric">
            <div className="v">{c.atDestination ? "0" : r.walkingM}<small> m</small></div>
            <div className="k">{c.atDestination ? "am Ziel" : "Fußweg"}</div>
          </div>
          <div className="metric">
            <div className="v">{r.usablePowerKw}<small> kW</small></div>
            <div className="k">{powerLabel(c)}</div>
          </div>
        </div>
        <div className="mono" style={{ fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--faint)", marginTop: 12 }}>
          {c.statusUpdatedAt ? `● Live · ${relTime(c.statusUpdatedAt)}` : "Keine Realtime-Daten"}
        </div>
        <div style={{ display: "flex", gap: 9, marginTop: 15 }}>
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
    <a className="row" href={walkFromChargerUrl(c, dest)} style={{ textDecoration: "none" }}>
      <span className="mono" style={{ fontSize: 11, color: "var(--faint)", width: 20, flex: "none" }}>
        {String(r.rank).padStart(2, "0")}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
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
      <h1 className="display" style={{ fontSize: 26, fontWeight: 300, margin: "5px 0 10px" }}>Ziel eingeben</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.5 }}>
        Automatische Auflösung fehlgeschlagen ({reason ?? "unbekannt"}). Gib Adresse oder Ort direkt ein.
      </p>
      <form method="get" action="/plan" style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
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
