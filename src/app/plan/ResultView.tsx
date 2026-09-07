"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import StartTripButton from "./StartTripButton";
import NightBadge from "./NightBadge";
import ResultMap from "./ResultMap";
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
  totalPoints: number;
  freePoints: number;
};

type Dest = { lat: number; lng: number; name?: string };

const STATUS: Record<string, { label: string; color: string }> = {
  available: { label: "Frei", color: "var(--free)" },
  occupied: { label: "Belegt", color: "var(--busy)" },
  outoforder: { label: "Defekt", color: "var(--broken)" },
  unknown: { label: "Unbekannt", color: "var(--unknown)" },
};

function relTime(iso?: string): string | null {
  if (!iso) return null;
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "gerade aktualisiert";
  if (diffMin < 60) return `vor ${diffMin} min`;
  return `vor ${Math.round(diffMin / 60)} h`;
}

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
  const scrollerRef = useRef<HTMLDivElement>(null);
  const programmatic = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToIndex = useCallback((i: number) => {
    const sc = scrollerRef.current;
    const child = sc?.children[i] as HTMLElement | undefined;
    if (!sc || !child) return;
    programmatic.current = true;
    child.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    setTimeout(() => { programmatic.current = false; }, 420);
  }, []);

  // Auswahl (Pin-Tap oder Karte) -> Karussell zentriert die Karte.
  useEffect(() => { scrollToIndex(selected); }, [selected, scrollToIndex]);

  const onScroll = useCallback(() => {
    if (programmatic.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const sc = scrollerRef.current;
      if (!sc) return;
      const mid = sc.scrollLeft + sc.clientWidth / 2;
      let best = 0, bd = Infinity;
      Array.from(sc.children).forEach((ch, i) => {
        const el = ch as HTMLElement;
        const c = el.offsetLeft + el.offsetWidth / 2;
        const d = Math.abs(c - mid);
        if (d < bd) { bd = d; best = i; }
      });
      setSelected((prev) => (prev === best ? prev : best));
    }, 90);
  }, []);

  const sel = options[selected]!;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, gap: 10 }}>
      {/* variabler Freiraum oben — Content sitzt unten (wie Startseite) */}
      <div style={{ flex: "1 1 auto", minHeight: 8 }} />

      <div style={{ flex: "none" }}>
        <div className="kicker">Ziel</div>
        <h1 className="display" style={{ fontSize: 22, fontWeight: 300, margin: "2px 0 0", lineHeight: 1.05, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{dest.name ?? "Ziel"}</h1>
        <div className="mono" style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 4 }}>
          {candidateCount} OPTION(EN){dwellLabel ? ` · ${dwellLabel}` : ""} · {demandLabel}
        </div>
      </div>

      {/* echte, sterilisierte Karte — saugt Restplatz, aber gedeckelt (quadratisch), genordet */}
      <div style={{ flex: "0 0 auto", height: "min(36vh, 280px)", minHeight: 180 }}>
        <ResultMap dest={dest} options={options} selected={selected} onSelect={setSelected} />
      </div>

      {/* seitlich swipe-bare Optionen; Karte reagiert */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="hide-scrollbar"
        style={{ flex: "none", display: "flex", gap: 10, overflowX: "auto", scrollSnapType: "x mandatory", scrollPaddingLeft: 2, WebkitOverflowScrolling: "touch" }}
      >
        {options.map((o, i) => {
          const st = STATUS[o.status] ?? STATUS.unknown!;
          const active = i === selected;
          const live = relTime(o.statusUpdatedAt);
          return (
            <button
              key={o.evseId}
              type="button"
              onClick={() => setSelected(i)}
              className="card"
              style={{
                scrollSnapAlign: "center", flex: "0 0 88%", textAlign: "left", cursor: "pointer",
                padding: "13px 15px", background: active ? "rgba(255,126,90,0.07)" : "rgba(22,22,27,0.72)",
                borderColor: active ? "rgba(255,126,90,0.5)" : "var(--line)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 16, fontWeight: 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.name}</span>
                <span className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: st.color, flex: "none" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.color }} />{st.label}
                </span>
              </div>
              <div className="metrics" style={{ marginTop: 12, gap: 20 }}>
                <div className="metric"><div className="v">{o.atDestination ? "0" : o.walkingM}<small> m</small></div><div className="k">{o.atDestination ? "am Ziel" : "Fußweg"}</div></div>
                <div className="metric"><div className="v">{o.usablePowerKw}<small> kW</small></div><div className="k">{o.connector === "dc" ? "Gleichstrom" : "Wechselstrom"}</div></div>
                <div className="metric"><div className="v" style={{ color: st.color }}>{o.freePoints}<small>/{o.totalPoints}</small></div><div className="k">{st.label.toLowerCase()}</div></div>
              </div>
              <div className="mono" style={{ fontSize: 9.5, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--faint)", marginTop: 10 }}>
                {live ? `● Live · ${live}` : "Keine Realtime-Daten"}
              </div>
            </button>
          );
        })}
      </div>

      {/* Aktionen für die ausgewählte Option */}
      <div style={{ flex: "none" }}>
        <NightBadge key={sel.evseId} lat={sel.lat} lng={sel.lng} />
        <div style={{ display: "flex", gap: 9, marginTop: 10 }}>
          <StartTripButton destLat={dest.lat} destLng={dest.lng} destName={dest.name} dwellMinutes={dwellMinutes} returnTripKm={returnTripKm} />
          <a className="btn ghost" href={walkFromChargerUrl({ lat: sel.lat, lng: sel.lng } as never, dest)} target="_blank" rel="noopener" style={{ flex: "none", padding: "0 16px" }}>
            Fußweg
          </a>
        </div>
      </div>
    </div>
  );
}
