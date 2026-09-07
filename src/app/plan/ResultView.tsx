"use client";

import { useState } from "react";
import StartTripButton from "./StartTripButton";
import NightBadge from "./NightBadge";
import OptionsMap from "./OptionsMap";
import { walkFromChargerUrl } from "@/lib/chargers";

export type ViewCharger = {
  evseId: string;
  name: string;
  lat: number;
  lng: number;
  status: string;
  connector: string;
  usablePowerKw: number;
  walkingM: number;
  atDestination: boolean;
  statusUpdatedAt?: string;
};

type Dest = { lat: number; lng: number; name?: string };

const STATUS: Record<string, { label: string; color: string }> = {
  available: { label: "Frei", color: "var(--free)" },
  occupied: { label: "Belegt", color: "var(--busy)" },
  outoforder: { label: "Defekt", color: "var(--broken)" },
  unknown: { label: "Unbekannt", color: "var(--unknown)" },
};

export default function ResultView({
  dest,
  options,
  dwellLabel,
  demandLabel,
  candidateCount,
  dwellMinutes,
  returnTripKm,
}: {
  dest: Dest;
  options: ViewCharger[];
  dwellLabel: string;
  demandLabel: string;
  candidateCount: number;
  dwellMinutes: number | null;
  returnTripKm: number | null;
}) {
  const [selected, setSelected] = useState(0);
  const c = options[selected]!;
  const st = STATUS[c.status] ?? STATUS.unknown!;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, gap: 12 }}>
      <div style={{ flex: "none" }}>
        <div className="kicker">Ziel</div>
        <h1 className="display" style={{ fontSize: 23, fontWeight: 300, margin: "2px 0 0", lineHeight: 1.05, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{dest.name ?? "Ziel"}</h1>
        <div className="mono" style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 4 }}>
          {candidateCount} OPTION(EN){dwellLabel ? ` · ${dwellLabel}` : ""} · {demandLabel}
        </div>
      </div>

      <div style={{ flex: "1 1 0", minHeight: 0 }}>
        <OptionsMap dest={dest} options={options} selected={selected} onSelect={setSelected} />
      </div>

      <div className="card" style={{ flex: "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 15px", borderBottom: "1px solid var(--line-2)" }}>
          <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0, marginRight: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
            {selected === 0 && <span className="mono" style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--coral)", flex: "none" }}>Beste</span>}
          </span>
          <span className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, color: st.color, flex: "none" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.color }} />{st.label}
          </span>
        </div>
        <div style={{ padding: "12px 15px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14 }}>
            <div className="metrics">
              <div className="metric"><div className="v">{c.atDestination ? "0" : c.walkingM}<small> m</small></div><div className="k">{c.atDestination ? "am Ziel" : "Fußweg"}</div></div>
              <div className="metric"><div className="v">{c.usablePowerKw}<small> kW</small></div><div className="k">{c.connector === "dc" ? "Gleichstrom" : "Wechselstrom"}</div></div>
            </div>
            <div className="mono" style={{ fontSize: 9, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--faint)", textAlign: "right", paddingBottom: 4 }}>
              {c.statusUpdatedAt ? `● Live · ${relTime(c.statusUpdatedAt)}` : "Keine Realtime-Daten"}
            </div>
          </div>
          <NightBadge key={c.evseId} lat={c.lat} lng={c.lng} />
          <div style={{ display: "flex", gap: 9, marginTop: 12 }}>
            <StartTripButton destLat={dest.lat} destLng={dest.lng} destName={dest.name} dwellMinutes={dwellMinutes} returnTripKm={returnTripKm} />
            <a className="btn ghost" href={walkFromChargerUrl({ lat: c.lat, lng: c.lng } as never, dest)} target="_blank" rel="noopener" style={{ flex: "none", padding: "0 16px" }}>
              Fußweg
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function relTime(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "gerade aktualisiert";
  if (diffMin < 60) return `vor ${diffMin} min`;
  return `vor ${Math.round(diffMin / 60)} h`;
}
