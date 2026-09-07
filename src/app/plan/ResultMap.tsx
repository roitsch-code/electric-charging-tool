"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LMap, Marker as LMarker } from "leaflet";

export type MapOpt = {
  lat: number;
  lng: number;
  status: string;
  freePoints: number;
  totalPoints: number;
};

const STATUS_COLOR: Record<string, string> = {
  available: "#5FD892",
  occupied: "#E0A24A",
  outoforder: "#E05B5B",
  unknown: "#8A8F98",
};

/** HTML für einen Options-Pin: Zähler (frei/gesamt), Farbe = Belegung.
 *  Ausgewählt = gleiche Farbe, aber weißer Ring + Glow + leicht größer. */
function pinHtml(o: MapOpt, active: boolean): string {
  const bg = STATUS_COLOR[o.status] ?? STATUS_COLOR.unknown!;
  const ring = active
    ? "box-shadow:0 0 0 3px rgba(255,255,255,0.95),0 8px 18px rgba(0,0,0,0.55);"
    : "box-shadow:0 3px 9px rgba(0,0,0,0.55);";
  const border = active ? "border:0;" : "border:2px solid #0C0C11;";
  const scale = active ? "scale(1.12)" : "scale(1)";
  return `<div style="transform:${scale};transform-origin:center bottom;display:flex;align-items:center;justify-content:center;min-width:38px;height:26px;padding:0 7px;border-radius:9px;font:600 12.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#0C0C0E;background:${bg};${border}${ring}white-space:nowrap;">${o.freePoints}/${o.totalPoints}</div>`;
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
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Karte einmalig aufbauen (Optionen/Ziel sind für die Seite konstant).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !elRef.current || mapRef.current) return;
      LRef.current = L;

      const map = L.map(elRef.current, {
        zoomControl: false,
        attributionControl: true,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
      });
      mapRef.current = map;
      map.attributionControl.setPrefix(false);

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 20,
        attribution: '&copy; OpenStreetMap &copy; CARTO',
      }).addTo(map);

      // Ziel: weißer Punkt
      const ziel = L.divIcon({
        className: "",
        html: '<div style="width:15px;height:15px;border-radius:50%;background:#F2F2F4;border:3px solid #0C0C11;box-shadow:0 0 0 1px rgba(255,255,255,0.3)"></div>',
        iconSize: [15, 15],
        iconAnchor: [7.5, 7.5],
      });
      L.marker([dest.lat, dest.lng], { icon: ziel, interactive: false, zIndexOffset: 1000 }).addTo(map);

      markersRef.current = options.map((o, i) => {
        const m = L.marker([o.lat, o.lng], {
          icon: L.divIcon({ className: "", html: pinHtml(o, i === selected), iconSize: [40, 26], iconAnchor: [20, 26] }),
          zIndexOffset: i === selected ? 900 : 400,
        });
        m.on("click", () => onSelectRef.current(i));
        m.addTo(map);
        return m;
      });

      const pts: [number, number][] = [[dest.lat, dest.lng], ...options.map((o) => [o.lat, o.lng] as [number, number])];
      map.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
      setTimeout(() => map.invalidateSize(), 60);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auswahl geändert: Icons neu setzen (Ring/Glow/Zorder) + sanft zentrieren.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || markersRef.current.length === 0) return;
    markersRef.current.forEach((m, i) => {
      m.setIcon(L.divIcon({ className: "", html: pinHtml(options[i]!, i === selected), iconSize: [40, 26], iconAnchor: [20, 26] }));
      m.setZIndexOffset(i === selected ? 900 : 400);
    });
    const sel = options[selected];
    if (sel) map.panTo([sel.lat, sel.lng], { animate: true, duration: 0.35 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return (
    <div style={{ position: "relative", height: "100%", width: "100%", borderRadius: 18, overflow: "hidden", border: "1px solid var(--line)", background: "#0C0C11" }}>
      <div ref={elRef} style={{ position: "absolute", inset: 0, background: "#0C0C11" }} />
      {/* Nord-Indikator — Karte ist immer genordet */}
      <div className="mono" style={{ position: "absolute", top: 10, right: 10, zIndex: 500, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, fontSize: 10, fontWeight: 600, color: "#C9C9D0", background: "rgba(10,10,12,0.6)", border: "1px solid var(--line)", borderRadius: 8, padding: "5px 7px", pointerEvents: "none" }}>
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#FF7E5A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18M12 3l5 6M12 3 7 9" /></svg>
        N
      </div>
    </div>
  );
}
