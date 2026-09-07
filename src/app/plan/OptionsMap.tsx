"use client";

/**
 * Schematische Karte aller Optionen: Ziel + alle Ladepunkte als Pins,
 * eingefärbt nach Belegung. Der ausgewählte Pin ist coral hervorgehoben und
 * per Tippen wählbar (onSelect). Positionen aus echten Koordinaten
 * (Bounding-Box-Projektion). Echte Kartenkacheln folgen später.
 */
type Pt = { lat: number; lng: number };
type Opt = Pt & { status?: string; walkingM?: number };

const STATUS_COLOR: Record<string, string> = {
  available: "#5FD892",
  occupied: "#E0A24A",
  outoforder: "#E05B5B",
  unknown: "#8A8F98",
};

export default function OptionsMap({
  dest,
  options,
  selected,
  onSelect,
}: {
  dest: Pt;
  options: Opt[];
  selected: number;
  onSelect: (i: number) => void;
}) {
  const W = 346;
  const H = 260;
  const pad = 0.18;

  const cosLat = Math.cos((dest.lat * Math.PI) / 180);
  const world = options.map((o) => ({
    o,
    x: (o.lng - dest.lng) * 111320 * cosLat,
    y: (o.lat - dest.lat) * 111320,
  }));
  const xs = [0, ...world.map((w) => w.x)];
  const ys = [0, ...world.map((w) => w.y)];
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 90);
  const spanY = Math.max(maxY - minY, 90);
  const s = Math.min((W * (1 - 2 * pad)) / spanX, (H * (1 - 2 * pad)) / spanY);
  const cX = (minX + maxX) / 2, cY = (minY + maxY) / 2;
  const px = (x: number, y: number) => ({ x: W / 2 + (x - cX) * s, y: H / 2 - (y - cY) * s });

  const destP = px(0, 0);
  const opts = world.map((w) => ({ ...w, p: px(w.x, w.y) }));
  const selP = opts[selected]?.p;
  const pct = (p: { x: number; y: number }) => ({ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%` });

  return (
    <div style={{ position: "relative", height: "100%", minHeight: 110, borderRadius: 18, overflow: "hidden", border: "1px solid var(--line)", background: "#0C0C11" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, display: "block" }}>
        <rect width={W} height={H} fill="#0C0C11" />
        <g stroke="rgba(255,255,255,0.045)" strokeWidth="8" fill="none" strokeLinecap="round">
          <path d={`M0 ${H * 0.3} H${W}`} /><path d={`M0 ${H * 0.66} H${W}`} />
          <path d={`M${W * 0.3} 0 V${H}`} /><path d={`M${W * 0.68} 0 V${H}`} />
        </g>
        <g stroke="rgba(255,255,255,0.03)" strokeWidth="3.5" fill="none">
          <path d={`M${W * 0.15} 0 V${H}`} /><path d={`M0 ${H * 0.48} H${W}`} /><path d={`M${W * 0.5} 0 V${H}`} />
        </g>
        {selP && (
          <path d={`M${selP.x} ${selP.y} L${destP.x} ${destP.y}`} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeDasharray="0.5 6" strokeLinecap="round" />
        )}
      </svg>

      {/* glow am ausgewählten Punkt */}
      {selP && (
        <div style={{ position: "absolute", ...pct(selP), transform: "translate(-50%,-50%)", width: 150, height: 150, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,130,95,0.34), rgba(255,130,95,0) 68%)", filter: "blur(6px)", pointerEvents: "none" }} />
      )}

      {/* Pins — tippbar */}
      {opts.map((w, i) => {
        const color = STATUS_COLOR[w.o.status ?? "unknown"] ?? STATUS_COLOR.unknown!;
        const active = i === selected;
        const size = active ? 28 : 22;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            aria-label={`Option ${i + 1}${w.o.walkingM != null ? `, ${w.o.walkingM} m Fußweg` : ""}`}
            aria-pressed={active}
            style={{ position: "absolute", ...pct(w.p), transform: "translate(-50%,-100%)", zIndex: active ? 3 : 2, background: "none", border: 0, padding: 8, margin: -8, cursor: "pointer" }}
          >
            <div style={{ width: size, height: size, borderRadius: "50% 50% 50% 3px", transform: "rotate(45deg)", background: active ? "linear-gradient(135deg,#FF86B9,#FF7E5A)" : color, border: active ? "0" : "2px solid #0C0C11", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: active ? "0 4px 12px rgba(255,126,90,0.45)" : "0 3px 9px rgba(0,0,0,0.5)" }}>
              <svg viewBox="0 0 24 24" width={active ? 12 : 10} height={active ? 12 : 10} fill={active ? "#0C0C0E" : "#0C0C11"} style={{ transform: "rotate(-45deg)" }}><path d="M13 2 5 13h6l-1 9 9-12h-6z" /></svg>
            </div>
          </button>
        );
      })}

      {/* Ziel */}
      <div style={{ position: "absolute", ...pct(destP), transform: "translate(-50%,-50%)", zIndex: 4, width: 15, height: 15, borderRadius: "50%", background: "#F2F2F4", border: "3px solid #0C0C11", boxShadow: "0 0 0 1px rgba(255,255,255,0.25)", pointerEvents: "none" }} />

      {/* Legende */}
      <div className="mono" style={{ position: "absolute", left: 10, bottom: 10, display: "flex", gap: 12, fontSize: 9.5, color: "#B9B9C0", background: "rgba(10,10,12,0.62)", border: "1px solid var(--line)", borderRadius: 8, padding: "5px 9px", pointerEvents: "none" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#5FD892" }} />FREI</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#E0A24A" }} />BELEGT</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: "2px", background: "#F2F2F4" }} />ZIEL</span>
      </div>
    </div>
  );
}
