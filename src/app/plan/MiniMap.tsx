/**
 * Kompakte, schematische Mini-Karte aus echten Koordinaten: relative Lage von
 * Ziel und Ladepunkt (Richtung + normierte Distanz), gepunkteter Gehweg.
 * Echte Kartenkacheln (MapKit/Mapbox) folgen später — hier bewusst minimal.
 */
export default function MiniMap({
  dest,
  charger,
  walkingM,
}: {
  dest: { lat: number; lng: number };
  charger: { lat: number; lng: number };
  walkingM: number;
}) {
  const W = 346;
  const H = 128;
  const cx = W / 2;
  const cy = H / 2;

  const dLatM = (charger.lat - dest.lat) * 111320;
  const dLngM = (charger.lng - dest.lng) * 111320 * Math.cos((dest.lat * Math.PI) / 180);
  const distM = Math.hypot(dLatM, dLngM);
  const target = 0.34 * Math.min(W, H);
  const unit = distM > 1 ? target / distM : 0;
  const vx = dLngM * unit;
  const vy = -dLatM * unit; // Bildschirm-Y zeigt nach unten, Norden oben

  const destPx = { x: cx - vx / 2, y: cy - vy / 2 };
  const chPx = { x: cx + vx / 2, y: cy + vy / 2 };
  const pct = (p: { x: number; y: number }) => ({ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%` });

  return (
    <div style={{ position: "relative", height: H, borderRadius: 16, overflow: "hidden", border: "1px solid var(--line)", background: "#0C0C11" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, display: "block" }}>
        <rect width={W} height={H} fill="#0C0C11" />
        <g stroke="rgba(255,255,255,0.05)" strokeWidth="7" fill="none" strokeLinecap="round">
          <path d={`M0 ${H * 0.34} H${W}`} /><path d={`M0 ${H * 0.72} H${W}`} />
          <path d={`M${W * 0.32} 0 V${H}`} /><path d={`M${W * 0.68} 0 V${H}`} />
        </g>
        <g stroke="rgba(255,255,255,0.035)" strokeWidth="3" fill="none">
          <path d={`M${W * 0.16} 0 V${H}`} /><path d={`M0 ${H * 0.55} H${W}`} /><path d={`M${W * 0.5} 0 L${W} ${H}`} />
        </g>
        <path
          d={`M${chPx.x} ${chPx.y} L${destPx.x} ${destPx.y}`}
          fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeDasharray="0.5 6" strokeLinecap="round"
        />
      </svg>

      {/* coral glow at charger */}
      <div style={{ position: "absolute", ...pct(chPx), transform: "translate(-50%,-50%)", width: 130, height: 130, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,130,95,0.30), rgba(255,130,95,0) 68%)", filter: "blur(5px)", pointerEvents: "none" }} />

      {/* charger pin */}
      <div style={{ position: "absolute", ...pct(chPx), transform: "translate(-50%,-100%)" }}>
        <div style={{ width: 24, height: 24, borderRadius: "50% 50% 50% 3px", transform: "rotate(45deg)", background: "linear-gradient(135deg,#FF86B9,#FF7E5A)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 9px rgba(0,0,0,0.5)" }}>
          <svg viewBox="0 0 24 24" width="11" height="11" fill="#0C0C0E" style={{ transform: "rotate(-45deg)" }}><path d="M13 2 5 13h6l-1 9 9-12h-6z" /></svg>
        </div>
      </div>

      {/* destination marker */}
      <div style={{ position: "absolute", ...pct(destPx), transform: "translate(-50%,-50%)", width: 14, height: 14, borderRadius: "50%", background: "#F2F2F4", border: "3px solid #0C0C11", boxShadow: "0 0 0 1px rgba(255,255,255,0.25)" }} />

      {/* distance chip */}
      <div className="mono" style={{ position: "absolute", left: 10, bottom: 10, fontSize: 10, letterSpacing: "0.06em", color: "#D8D8DC", background: "rgba(10,10,12,0.66)", border: "1px solid var(--line)", borderRadius: 8, padding: "5px 9px" }}>
        {walkingM} M FUSSWEG
      </div>
    </div>
  );
}
