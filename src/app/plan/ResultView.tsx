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
  available: { label: "frei", color: "var(--free)" },
  occupied: { label: "belegt", color: "var(--busy)" },
  outoforder: { label: "defekt", color: "var(--broken)" },
  unknown: { label: "unbekannt", color: "var(--unknown)" },
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
      <div style={{ flex: "0 0 auto", height: "min(42vh, 322px)", minHeight: 200 }}>
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
          return (
            <button
              key={o.evseId}
              type="button"
              onClick={() => setSelected(i)}
              className="card"
              style={{
                scrollSnapAlign: "center", flex: "0 0 86%", textAlign: "left", cursor: "pointer",
                padding: "12px 14px", background: active ? "rgba(255,126,90,0.07)" : "rgba(22,22,27,0.72)",
                borderColor: active ? "rgba(255,126,90,0.5)" : "var(--line)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.color, flex: "none" }} />
                <span style={{ fontSize: 15.5, fontWeight: 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.name}</span>
              </div>
              <div className="mono" style={{ fontSize: 11, letterSpacing: "0.03em", color: "var(--muted)", marginTop: 8, textTransform: "uppercase" }}>
                <span style={{ color: st.color, fontWeight: 600 }}>{o.freePoints}/{o.totalPoints} {st.label}</span>
                <span style={{ color: "var(--faint)" }}> · {o.atDestination ? "am Ziel" : `${o.walkingM} m`} · {o.usablePowerKw} kW {o.connector === "dc" ? "DC" : "AC"}</span>
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
