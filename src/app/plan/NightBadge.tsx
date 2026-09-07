"use client";

import { useEffect, useState } from "react";

type Verdict = "free" | "limited" | "closed" | "unknown";
type Rule = { verdict: Verdict; label: string };

const COLOR: Record<Verdict, string> = {
  free: "#8FE3B3",
  limited: "#EEC486",
  closed: "#F0A6A6",
  unknown: "#B9B9C2",
};

/** Standzeit-/Nachtregel als schlichte Zeile (kein Kasten, kein Icon):
 *  Label + farbiger Wert. Fügt sich in die Options-Karte ein. */
export default function NightBadge({ lat, lng }: { lat: number; lng: number }) {
  const [rule, setRule] = useState<Rule | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setRule(null);
    fetch(`/api/nightrule?lat=${lat}&lng=${lng}`)
      .then((r) => r.json())
      .then((d: Rule) => { if (alive) { setRule(d); setLoading(false); } })
      .catch(() => { if (alive) { setRule({ verdict: "unknown", label: "unbekannt — Schild prüfen" }); setLoading(false); } });
    return () => { alive = false; };
  }, [lat, lng]);

  const v = rule?.verdict ?? "unknown";

  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 11 }}>
      <span className="mono" style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--faint)", flex: "none" }}>Standzeit</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: loading ? "#8A8A92" : COLOR[v], lineHeight: 1.3 }}>
        {loading ? "wird geprüft…" : (rule?.label ?? "unbekannt")}
      </span>
    </div>
  );
}
