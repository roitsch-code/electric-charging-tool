import Link from "next/link";
import {
  driveToChargerUrl,
  planDestination,
  spokenForPlan,
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
  ac_ok: "Aufenthalt lang — Wechselstrom (11 kW) reicht, günstiger",
  ac_or_dc: "Mittlerer Aufenthalt — Wechselstrom oder Gleichstrom",
  dc_required: "Kurzer Halt oder weite Rückfahrt — Schnelllader nötig",
};

const C = {
  bg: "#0b0d10",
  card: "#14181d",
  card2: "#1b2129",
  text: "#e6e8eb",
  muted: "#9aa2ac",
  accent: "#4ea1ff",
  green: "#3fbf7f",
  amber: "#e0a63b",
  red: "#e0603b",
};

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  const dest = await resolveDestination({
    lat: one(sp.lat),
    lng: one(sp.lng),
    u: one(sp.u),
    to: one(sp.to),
    q: one(sp.q),
    name: one(sp.name),
  });

  const input = parsePlanInput({ dwell: one(sp.dwell), return: one(sp.return) });

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "2rem 1.25rem" }}>
      <Link href="/" style={{ color: C.muted, textDecoration: "none", fontSize: "0.85rem" }}>
        ← Ladeplanner
      </Link>

      {!dest.ok || !dest.coords ? (
        <ManualFallback hint={dest.placeNameHint} reason={dest.reason} />
      ) : (
        <Result coords={dest.coords} method={dest.method} input={input} />
      )}

      <DemoLinks />
    </main>
  );
}

async function Result({
  coords,
  method,
  input,
}: {
  coords: { lat: number; lng: number; name?: string };
  method?: string;
  input: ReturnType<typeof parsePlanInput>;
}) {
  const plan = await planDestination(
    coords,
    input,
    getChargerSource(),
    getAvailabilityProvider(),
  );
  const spoken = spokenForPlan(plan, input, 0);

  return (
    <>
      <h1 style={{ fontSize: "1.5rem", marginBottom: 4 }}>
        {coords.name ?? "Ziel"}
      </h1>
      <p style={{ color: C.muted, marginTop: 0, fontSize: "0.85rem" }}>
        {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
        {method ? ` · aufgelöst via ${method}` : ""}
        {input.dwellMinutes !== null ? ` · Aufenthalt ${input.dwellMinutes} min` : ""}
        {input.returnTripKm !== null ? ` · Rückfahrt ${input.returnTripKm} km` : ""}
      </p>

      <p
        style={{
          background: C.card2,
          borderLeft: `3px solid ${C.accent}`,
          padding: "0.6rem 0.9rem",
          borderRadius: 6,
          fontSize: "0.9rem",
        }}
      >
        {DEMAND_LABEL[plan.demandClass]}
      </p>

      {/* Sprechtext-Vorschau (Konzept §6.6) */}
      {spoken && (
        <section style={{ marginTop: "1.25rem" }}>
          <h2 style={{ fontSize: "0.8rem", color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Ansage (wird vorgelesen)
          </h2>
          <blockquote
            style={{
              margin: 0,
              background: C.card,
              padding: "0.9rem 1rem",
              borderRadius: 8,
              fontSize: "1rem",
              fontStyle: "italic",
            }}
          >
            🔊 {spoken}
          </blockquote>
        </section>
      )}

      {plan.expanded && (
        <p style={{ color: C.amber, fontSize: "0.85rem", marginTop: "1rem" }}>
          ⚠️ Nichts in 500 m — Umkreis auf {plan.usedRadiusM} m erweitert.
        </p>
      )}

      <h2 style={{ fontSize: "1rem", marginTop: "1.5rem" }}>
        {plan.top.length > 0 ? `Top ${plan.top.length}` : "Keine Ladepunkte in Gehdistanz"}
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {plan.top.map((r) => (
          <ChargerCard key={r.charger.evseId} r={r} dest={coords} />
        ))}
      </div>

      <p style={{ color: C.muted, fontSize: "0.75rem", marginTop: "1.25rem" }}>
        {plan.candidateCount} Kandidat(en) im {plan.usedRadiusM}-m-Umkreis.
        Verfügbarkeitsdaten stammen vom Betreiber — ohne Realtime steht
        „Status unbekannt“. Gehdistanzen sind aus der Luftlinie geschätzt
        (Umwegfaktor 1,3), bis echtes Fußwege-Routing angebunden ist.
      </p>
    </>
  );
}

function ChargerCard({
  r,
  dest,
}: {
  r: RankedCharger;
  dest: { lat: number; lng: number };
}) {
  const c = r.charger;
  const capped = c.connector === "dc" && r.usablePowerKw < c.powerKw;
  return (
    <div style={{ background: C.card, borderRadius: 10, padding: "0.9rem 1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div>
          <span
            style={{
              display: "inline-block",
              minWidth: 22,
              textAlign: "center",
              background: r.rank === 1 ? C.accent : C.card2,
              color: r.rank === 1 ? "#00121f" : C.text,
              borderRadius: 6,
              fontWeight: 700,
              fontSize: "0.8rem",
              padding: "1px 6px",
              marginRight: 8,
            }}
          >
            {r.rank}
          </span>
          <strong>{c.name}</strong>
          {c.atDestination && (
            <span style={{ color: C.green, fontSize: "0.8rem", marginLeft: 8 }}>
              am Ziel
            </span>
          )}
        </div>
        <StatusPill r={r} />
      </div>

      <div style={{ color: C.muted, fontSize: "0.85rem", marginTop: 6 }}>
        {c.connector === "dc" ? "Gleichstrom" : "Wechselstrom"} ·{" "}
        {capped ? (
          <span>
            {c.powerKw} kW Säule, davon <strong style={{ color: C.text }}>{r.usablePowerKw} kW</strong> nutzbar
          </span>
        ) : (
          <span>{c.powerKw} kW</span>
        )}{" "}
        · {c.atDestination ? "direkt am Ziel" : `${r.walkingM} m Fußweg`}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <a href={driveToChargerUrl(c)} style={btn(C.accent)}>
          Hinfahren
        </a>
        <a href={walkFromChargerUrl(c, dest)} style={btn(C.card2)}>
          Fußweg zum Ziel
        </a>
      </div>
    </div>
  );
}

function StatusPill({ r }: { r: RankedCharger }) {
  const s = r.charger.status ?? "unknown";
  const map: Record<string, { label: string; color: string }> = {
    available: { label: "frei", color: C.green },
    occupied: { label: "belegt", color: C.amber },
    outoforder: { label: "defekt", color: C.red },
    unknown: { label: "Status unbekannt", color: C.muted },
  };
  const { label, color } = map[s] ?? map.unknown!;
  return (
    <div style={{ textAlign: "right" }}>
      <span style={{ color, fontSize: "0.85rem", fontWeight: 600 }}>● {label}</span>
      <div style={{ color: C.muted, fontSize: "0.72rem" }}>
        {r.charger.statusUpdatedAt ? relTime(r.charger.statusUpdatedAt) : "keine Realtime-Daten"}
      </div>
    </div>
  );
}

function ManualFallback({ hint, reason }: { hint?: string; reason?: string }) {
  return (
    <section style={{ marginTop: "1.5rem" }}>
      <h1 style={{ fontSize: "1.4rem" }}>Ziel manuell eingeben</h1>
      <p style={{ color: C.muted, fontSize: "0.9rem" }}>
        Die automatische Auflösung ist fehlgeschlagen ({reason ?? "unbekannt"}).
        Das ist der eingeplante Stufe-3-Fallback (Konzept §4).
      </p>
      <form method="get" action="/plan" style={{ marginTop: "1rem" }}>
        <input
          name="to"
          defaultValue={hint ?? ""}
          placeholder="Adresse oder Ortsname, z. B. Kurhaus Baden-Baden"
          style={inputStyle}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input name="dwell" placeholder="Dauer (kurz/paar/nacht)" style={inputStyle} />
          <input name="return" placeholder="Rückfahrt km" style={inputStyle} />
        </div>
        <button type="submit" style={{ ...btn(C.accent), marginTop: 10, border: "none", cursor: "pointer" }}>
          Planen
        </button>
      </form>
    </section>
  );
}

function DemoLinks() {
  return (
    <section style={{ marginTop: "2.5rem", borderTop: `1px solid ${C.card2}`, paddingTop: "1rem" }}>
      <h2 style={{ fontSize: "0.8rem", color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
        Demo (Seed-Daten)
      </h2>
      <ul style={{ lineHeight: 1.9, fontSize: "0.9rem" }}>
        <li>
          <Link href="/plan?lat=53.5510&lng=9.9215&name=Gastwerk%20Hotel%20Hamburg&dwell=nacht" style={{ color: C.accent }}>
            Gastwerk Hotel, über Nacht
          </Link>{" "}
          <span style={{ color: C.muted }}>→ AC am Ziel gewinnt</span>
        </li>
        <li>
          <Link href="/plan?lat=53.5510&lng=9.9215&name=Gastwerk%20Hotel%20Hamburg&dwell=kurz&return=300" style={{ color: C.accent }}>
            Gastwerk Hotel, kurzer Halt + 300 km zurück
          </Link>{" "}
          <span style={{ color: C.muted }}>→ Schnelllader gewinnt</span>
        </li>
        <li>
          <Link href="/plan?lat=53.2000&lng=7.5000&name=Landgasthof&dwell=paar" style={{ color: C.accent }}>
            Ländliches Ziel
          </Link>{" "}
          <span style={{ color: C.muted }}>→ Radius-Erweiterung</span>
        </li>
      </ul>
    </section>
  );
}

function relTime(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "gerade aktualisiert";
  if (diffMin < 60) return `aktualisiert vor ${diffMin} min`;
  const h = Math.round(diffMin / 60);
  return `aktualisiert vor ${h} h`;
}

function btn(bg: string): React.CSSProperties {
  return {
    background: bg,
    color: bg === C.accent ? "#00121f" : C.text,
    padding: "0.45rem 0.8rem",
    borderRadius: 7,
    textDecoration: "none",
    fontSize: "0.85rem",
    fontWeight: 600,
    display: "inline-block",
  };
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  width: "100%",
  boxSizing: "border-box",
  background: C.card,
  border: `1px solid ${C.card2}`,
  borderRadius: 7,
  color: C.text,
  padding: "0.55rem 0.7rem",
  fontSize: "0.9rem",
};
