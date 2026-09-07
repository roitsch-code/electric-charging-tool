"use client";

import { useEffect, useState } from "react";

type Verdict = "free" | "limited" | "closed" | "unknown";
type Rule = { verdict: Verdict; label: string };

const STYLE: Record<Verdict, { color: string; bg: string; border: string }> = {
  free: { color: "#8FE3B3", bg: "rgba(95,216,146,0.10)", border: "rgba(95,216,146,0.28)" },
  limited: { color: "#EEC486", bg: "rgba(224,162,74,0.10)", border: "rgba(224,162,74,0.28)" },
  closed: { color: "#F0A6A6", bg: "rgba(224,91,91,0.10)", border: "rgba(224,91,91,0.28)" },
  unknown: { color: "#B9B9C2", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.12)" },
};

const MoonIcon = (c: string) => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>
);

export default function NightBadge({ lat, lng }: { lat: number; lng: number }) {
  const [rule, setRule] = useState<Rule | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch(`/api/nightrule?lat=${lat}&lng=${lng}`)
      .then((r) => r.json())
      .then((d: Rule) => { if (alive) { setRule(d); setLoading(false); } })
      .catch(() => { if (alive) { setRule({ verdict: "unknown", label: "Standzeit unbekannt — Schild prüfen" }); setLoading(false); } });
    return () => { alive = false; };
  }, [lat, lng]);

  const v = rule?.verdict ?? "unknown";
  const s = STYLE[v];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", borderRadius: 11, background: s.bg, border: `1px solid ${s.border}` }}>
      <span style={{ flex: "none", display: "flex" }}>{MoonIcon(loading ? "#B9B9C2" : s.color)}</span>
      <span style={{ fontSize: 13, color: loading ? "#B9B9C2" : s.color, lineHeight: 1.35, fontWeight: 500 }}>
        {loading ? "Standzeit wird geprüft…" : (rule?.label ?? "Standzeit unbekannt")}
      </span>
    </div>
  );
}
