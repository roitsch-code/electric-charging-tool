"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import StartTripButton from "./StartTripButton";
import ResultMap from "./ResultMap";
import { walkFromChargerUrl } from "@/lib/chargers";

export type ViewCharger = {
  evseId: string;
  name: string;
  lat: number;
  lng: number;
  status: string;
  connector: string;
  powerKw: number;
  usablePowerKw: number;
  walkingM: number;
  atDestination: boolean;
  statusUpdatedAt?: string;
  totalPoints: number;
  freePoints: number | null;
  standzeitLabel: string | null;
  standzeitVerdict: "free" | "limited" | "closed" | "unknown" | null;
  standzeitSource: string | null;
  city: string | null;
};

const STANDZEIT_COLOR: Record<string, string> = {
  free: "#8FE3B3", limited: "#EEC486", closed: "#F0A6A6", unknown: "#B9B9C2",
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
  // Ergebnisse der „Suche Standzeit"-Recherche, je Ladepunkt (evseId).
  type Researched =
    | { label: string; verdict: "free" | "limited" | "closed" | "unknown"; source: string | null; note: string | null }
    | { notFound: true };
  const [researched, setResearched] = useState<Record<string, Researched>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const searchStandzeit = useCallback(
    async (o: ViewCharger, e: MouseEvent) => {
      e.stopPropagation();
      if (!o.city || loadingId) return;
      setLoadingId(o.evseId);
      try {
        const res = await fetch("/api/standzeit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ city: o.city, connector: o.connector }),
        });
        const data = await res.json();
        setResearched((prev) => ({
          ...prev,
          [o.evseId]: data?.found
            ? { label: data.label, verdict: data.verdict ?? "unknown", source: data.source ?? null, note: data.note ?? null }
            : { notFound: true },
        }));
      } catch {
        setResearched((prev) => ({ ...prev, [o.evseId]: { notFound: true } }));
      } finally {
        setLoadingId(null);
      }
    },
    [loadingId],
  );

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
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, gap: 11 }}>
      <div style={{ flex: "1 1 auto", minHeight: 8 }} />

      {/* Header — lesbar, klare Hierarchie */}
      <div style={{ flex: "none" }}>
        <div className="mono" style={{ fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--muted)" }}>Ziel</div>
        <h1 className="display" style={{ fontSize: 24, fontWeight: 300, margin: "3px 0 0", lineHeight: 1.08, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{dest.name ?? "Ziel"}</h1>
        <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 5 }}>
          {candidateCount} Option{candidateCount === 1 ? "" : "en"}{dwellLabel ? ` · ${dwellLabel}` : ""} · {demandLabel}
        </div>
      </div>

      {/* echte, genordete Karte */}
      <div style={{ flex: "0 0 auto", height: "min(33vh, 258px)", minHeight: 172 }}>
        <ResultMap dest={dest} options={options} selected={selected} onSelect={setSelected} />
      </div>

      {/* Optionen — volle Breite, swipe-bar, mit Standzeit */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="hide-scrollbar"
        style={{ flex: "none", display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", touchAction: "pan-x", overscrollBehaviorX: "contain" }}
      >
        {options.map((o, i) => {
          const st = STATUS[o.status] ?? STATUS.unknown!;
          const live = relTime(o.statusUpdatedAt);
          return (
            <div key={o.evseId} style={{ scrollSnapAlign: "center", flex: "0 0 100%", minWidth: "100%" }}>
              <button
                type="button"
                onClick={() => setSelected(i)}
                className="card"
                style={{ width: "100%", textAlign: "left", cursor: "pointer", padding: "13px 15px", background: "rgba(22,22,27,0.72)" }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontSize: 16, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.name}</span>
                  <span className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: st.color, flex: "none" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.color }} />{st.label}
                  </span>
                </div>
                <div className="metrics" style={{ marginTop: 12, gap: 22 }}>
                  <div className="metric"><div className="v">{o.atDestination ? "0" : o.walkingM}<small> m</small></div><div className="k">{o.atDestination ? "am Ziel" : "Fußweg"}</div></div>
                  <div className="metric"><div className="v">{o.powerKw}<small> kW</small></div><div className="k">{o.connector === "dc" ? "Gleichstrom" : "Wechselstrom"}</div></div>
                  <div className="metric">
                    {o.freePoints != null
                      ? <div className="v" style={{ color: st.color }}>{o.freePoints}<small>/{o.totalPoints}</small></div>
                      : <div className="v">{o.totalPoints}<small> ×</small></div>}
                    <div className="k">{o.freePoints != null ? "frei/gesamt" : "Ladepunkte"}</div>
                  </div>
                </div>
                <div className="mono" style={{ fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase", color: "#7C7C85", marginTop: 10 }}>
                  {live ? `● Live · ${live}` : o.freePoints != null ? "Keine Realtime-Daten" : "Belegung: keine Live-Daten"}
                </div>
                {(() => {
                  const rr = researched[o.evseId];
                  const got = rr && !("notFound" in rr) ? rr : null;
                  const notFound = !!rr && "notFound" in rr;
                  const label = got?.label ?? o.standzeitLabel ?? null;
                  const verdict = got?.verdict ?? o.standzeitVerdict ?? "unknown";
                  const sourceUrl = got?.source ?? null;
                  const busy = loadingId === o.evseId;
                  const originTag = got
                    ? "recherchiert"
                    : o.standzeitLabel
                      ? (o.standzeitSource ?? "kuratiert")
                      : null;
                  return (
                    <div style={{ marginTop: 11 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <span className="mono" style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--faint)", flex: "none" }}>Standzeit</span>
                        <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.3, color: STANDZEIT_COLOR[label ? verdict : "unknown"] }}>
                          {label ?? "Nur während des Ladens · Höchstparkdauer laut Schild"}
                        </span>
                      </div>
                      {(originTag || sourceUrl || got?.note) && (
                        <div className="mono" style={{ fontSize: 9, letterSpacing: "0.06em", color: "#7C7C85", marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {originTag && <span style={{ textTransform: "uppercase" }}>{originTag}</span>}
                          {got?.note && <span>{got.note}</span>}
                          {sourceUrl && (
                            <a href={sourceUrl} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} style={{ color: "var(--coral)" }}>Quelle ↗</a>
                          )}
                        </div>
                      )}
                      {notFound && (
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, lineHeight: 1.35 }}>
                          Keine belastbare Regel gefunden — Höchstparkdauer laut Schild vor Ort.
                        </div>
                      )}
                      {!label && o.city && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => searchStandzeit(o, e)}
                          aria-busy={busy}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 7, marginTop: 8,
                            padding: "6px 12px", borderRadius: 999, cursor: busy ? "default" : "pointer",
                            fontSize: 12, fontWeight: 600, color: "var(--fg)",
                            border: "1px solid var(--line, rgba(255,255,255,0.14))",
                            background: "rgba(255,255,255,0.04)", opacity: busy ? 0.6 : 1,
                          }}
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" />
                          </svg>
                          {busy ? "Suche läuft …" : notFound ? "Erneut suchen" : "Suche Standzeit"}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </button>
            </div>
          );
        })}
      </div>

      {/* Punkt-Indikator */}
      {options.length > 1 && (
        <div style={{ flex: "none", display: "flex", justifyContent: "center", alignItems: "center", gap: 7 }}>
          {options.map((o, i) => (
            <button
              key={o.evseId}
              type="button"
              aria-label={`Option ${i + 1}`}
              onClick={() => setSelected(i)}
              style={{ padding: 4, background: "none", border: 0, cursor: "pointer", display: "flex" }}
            >
              <span style={{ display: "block", height: 7, width: i === selected ? 20 : 7, borderRadius: 4, background: i === selected ? "var(--coral)" : "var(--faint)", transition: "width 0.2s, background 0.2s" }} />
            </button>
          ))}
        </div>
      )}

      {/* Aktionen für die ausgewählte Option */}
      <div style={{ flex: "none", display: "flex", gap: 9 }}>
        <StartTripButton
          destLat={dest.lat}
          destLng={dest.lng}
          destName={dest.name}
          dwellMinutes={dwellMinutes}
          returnTripKm={returnTripKm}
          // Die gerade gewählte Säule wird ab 15 min vor Ankunft überwacht.
          target={{
            evseId: sel.evseId,
            name: sel.name,
            lat: sel.lat,
            lng: sel.lng,
            status: sel.status,
            free: sel.freePoints,
            total: sel.totalPoints,
          }}
        />
        <a className="btn ghost" href={walkFromChargerUrl({ lat: sel.lat, lng: sel.lng } as never, dest)} target="_blank" rel="noopener" style={{ flex: "none", padding: "0 16px" }}>
          Fußweg
        </a>
      </div>
    </div>
  );
}
