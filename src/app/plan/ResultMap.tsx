"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LMap, Marker as LMarker, Point as LPoint } from "leaflet";

export type MapOpt = {
  lat: number;
  lng: number;
  status: string;
  freePoints: number;
  totalPoints: number;
};

type Off = { dx: number; dy: number };

const STATUS_COLOR: Record<string, string> = {
  available: "#5FD892",
  occupied: "#E0A24A",
  outoforder: "#E05B5B",
  unknown: "#8A8F98",
};

/** Pin: Blitz + Zähler (frei/gesamt) in einer Sprechblase mit Spitze, Farbe =
 *  Belegung. Ausgewählt = weißer Ring + Glow + leicht größer. `off` verschiebt
 *  überlappende Pins minimal, damit nichts kollidiert. */
function pinHtml(o: MapOpt, active: boolean, off: Off): string {
  const bg = STATUS_COLOR[o.status] ?? STATUS_COLOR.unknown!;
  const ring = active
    ? "box-shadow:0 0 0 3px rgba(255,255,255,0.95),0 9px 20px rgba(0,0,0,0.55);"
    : "box-shadow:0 4px 11px rgba(0,0,0,0.55);";
  const bdr = active ? "" : "border:2px solid #0C0C11;";
  const scale = active ? 1.1 : 1;
  return `<div style="transform:translate(${off.dx}px,${off.dy}px);width:64px;display:flex;flex-direction:column;align-items:center;">
    <div style="transform:scale(${scale});transform-origin:center bottom;display:flex;align-items:center;gap:3px;padding:3px 8px 3px 5px;border-radius:10px;background:${bg};${bdr}${ring}">
      <svg viewBox="0 0 24 24" width="12" height="12" fill="#0C0C0E" style="flex:none"><path d="M13 2 5 13h6l-1 9 9-12h-6z"/></svg>
      <span style="font:600 12.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#0C0C0E;white-space:nowrap;">${o.freePoints}/${o.totalPoints}</span>
    </div>
    <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid ${bg};margin-top:-1px;transform:scale(${scale});transform-origin:center top;"></div>
  </div>`;
}

export default function ResultMap({
  dest,
  options,
  selected,
  onSelect,
}: {
  dest: { lat: number; lng: number };
  options: MapOpt[];
  selected: number;
  onSelect: (i: number) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const markersRef = useRef<LMarker[]>([]);
  const offsetsRef = useRef<Off[]>(options.map(() => ({ dx: 0, dy: 0 })));
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const selRef = useRef(selected);
  selRef.current = selected;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const makeIcon = (L: typeof import("leaflet"), o: MapOpt, active: boolean, off: Off) =>
    L.divIcon({ className: "", html: pinHtml(o, active, off), iconSize: [64, 40], iconAnchor: [32, 38] });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !elRef.current || mapRef.current) return;
      LRef.current = L;

      const map = L.map(elRef.current, {
        zoomControl: false, attributionControl: true, scrollWheelZoom: false,
        doubleClickZoom: false, boxZoom: false, touchZoom: false, keyboard: false,
      });
      mapRef.current = map;
      map.attributionControl.setPrefix(false);

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd", maxZoom: 20, attribution: "&copy; OpenStreetMap &copy; CARTO",
      }).addTo(map);

      const ziel = L.divIcon({
        className: "",
        html: '<div style="width:14px;height:14px;border-radius:50%;background:#F2F2F4;border:3px solid #0C0C11;box-shadow:0 0 0 2px rgba(255,255,255,0.28),0 3px 8px rgba(0,0,0,0.5)"></div>',
        iconSize: [14, 14], iconAnchor: [7, 7],
      });
      L.marker([dest.lat, dest.lng], { icon: ziel, interactive: false, zIndexOffset: 1000 }).addTo(map);

      markersRef.current = options.map((o, i) => {
        const m = L.marker([o.lat, o.lng], { icon: makeIcon(L, o, i === selRef.current, { dx: 0, dy: 0 }), zIndexOffset: i === selRef.current ? 900 : 400 });
        m.on("click", () => onSelectRef.current(i));
        m.addTo(map);
        return m;
      });

      const pts: [number, number][] = [[dest.lat, dest.lng], ...options.map((o) => [o.lat, o.lng] as [number, number])];
      map.fitBounds(pts, { padding: [46, 46], maxZoom: 16 });

      // Kollisions-Versatz erst, wenn Zoom/Position feststehen.
      map.whenReady(() => {
        setTimeout(() => {
          if (cancelled || !mapRef.current) return;
          offsetsRef.current = computeOffsets(map, dest, options);
          markersRef.current.forEach((m, i) => m.setIcon(makeIcon(L, options[i]!, i === selRef.current, offsetsRef.current[i]!)));
          map.invalidateSize();
        }, 80);
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auswahl: Icons neu (Ring/Glow/Zorder), Versatz beibehalten.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || markersRef.current.length === 0) return;
    markersRef.current.forEach((m, i) => {
      m.setIcon(makeIcon(L, options[i]!, i === selected, offsetsRef.current[i] ?? { dx: 0, dy: 0 }));
      m.setZIndexOffset(i === selected ? 900 : 400);
    });
    const sel = options[selected];
    if (sel) map.panTo([sel.lat, sel.lng], { animate: true, duration: 0.35 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return (
    <div style={{ position: "relative", height: "100%", width: "100%", borderRadius: 18, overflow: "hidden", border: "1px solid var(--line)", background: "#0C0C11" }}>
      <div ref={elRef} style={{ position: "absolute", inset: 0, background: "#0C0C11" }} />
      {/* Nord-Indikator — feiner, on-brand */}
      <div style={{ position: "absolute", top: 11, right: 11, zIndex: 500, width: 30, height: 30, borderRadius: "50%", background: "rgba(12,12,17,0.6)", border: "1px solid var(--line)", backdropFilter: "blur(2px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, pointerEvents: "none" }}>
        <svg viewBox="0 0 12 12" width="9" height="9" style={{ display: "block" }}>
          <path d="M6 1 L9 8 L6 6 L3 8 Z" fill="#FF7E5A" />
        </svg>
        <span className="mono" style={{ fontSize: 8, fontWeight: 600, letterSpacing: "0.05em", color: "#C9C9D0", lineHeight: 1 }}>N</span>
      </div>
    </div>
  );
}

/** Schiebt Pins, die auf dem Ziel oder aufeinander liegen, minimal auseinander
 *  (Pixelraum), damit sich nichts überlagert. */
function computeOffsets(map: LMap, dest: { lat: number; lng: number }, opts: MapOpt[]): Off[] {
  const MIN = 46;
  const BUBBLE_DY = -26; // Sprechblase sitzt ~26px über dem Anker (Spitze)
  const D = map.latLngToLayerPoint([dest.lat, dest.lng]); // Ziel-Punkt-Mitte
  const kept: { x: number; y: number }[] = [{ x: D.x, y: D.y }];
  const out: Off[] = [];
  opts.forEach((o, i) => {
    const base = map.latLngToLayerPoint([o.lat, o.lng]);
    const baseCp = { x: base.x, y: base.y + BUBBLE_DY }; // Blasen-Mitte
    const pos = { x: baseCp.x, y: baseCp.y };
    for (let iter = 0; iter < 18; iter++) {
      let moved = false;
      for (const k of kept) {
        const dx = pos.x - k.x, dy = pos.y - k.y;
        const dist = Math.hypot(dx, dy);
        if (dist < MIN) {
          const ang = dist > 0.5 ? Math.atan2(dy, dx) : (i + 1) * 2.399; // goldener Winkel bei Deckung
          const need = MIN - dist + 0.5;
          pos.x += Math.cos(ang) * need;
          pos.y += Math.sin(ang) * need;
          moved = true;
        }
      }
      if (!moved) break;
    }
    out.push({ dx: Math.round(pos.x - baseCp.x), dy: Math.round(pos.y - baseCp.y) });
    kept.push({ x: pos.x, y: pos.y });
  });
  return out;
}
