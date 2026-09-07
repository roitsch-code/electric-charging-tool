"use client";

import { useEffect, useState, type ReactNode, type MouseEvent } from "react";

const IconChevron = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--faint)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 6 6 6-6 6" />
  </svg>
);
const IconHome = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
    <path d="m3 11 9-7 9 7M5 10v10h14V10" />
  </svg>
);
const IconFamily = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="2.4" /><circle cx="16" cy="8" r="2.4" />
    <path d="M4 20v-2a4 4 0 0 1 4-4M20 20v-2a4 4 0 0 0-4-4M9 20v-1a3 3 0 0 1 6 0v1" />
  </svg>
);
const IconClock = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" />
  </svg>
);

type Fav = { icon: ReactNode; name: string; sub: string; query: string };

const planHref = (q: string, dwell: string) =>
  `/plan?q=${encodeURIComponent(q)}&dwell=${encodeURIComponent(dwell)}`;

// Feste Spots (n=1): Zuhause + Schwiegereltern.
const ZUHAUSE_Q = "Ackerstraße 199, 40233 Düsseldorf";
const EMMERICH_Q = "Ingenkampstraße 61, 46446 Emmerich";

const FIXED: Fav[] = [
  { icon: IconHome, name: "Zuhause", sub: "ACKERSTRASSE 199 · DÜSSELDORF", query: ZUHAUSE_Q },
  { icon: IconFamily, name: "Schwiegereltern", sub: "INGENKAMPSTR. 61 · EMMERICH", query: EMMERICH_Q },
];

/** Grobe Normalisierung, um den letzten Spot gegen die festen zu prüfen. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

/** Ist der gespeicherte Query einer der beiden festen Spots? Dann nicht doppelt. */
function isFixed(query: string): boolean {
  const n = norm(query);
  return (
    n.includes("ackerstrasse199") ||
    n.includes("ingenkampstrasse61") ||
    n.includes("ingenkampstr61")
  );
}

/** Aktuell gewählte Aufenthalt-Stufe von der Startseite lesen (Radio "dwell"). */
function currentDwell(): string {
  try {
    const el = document.querySelector<HTMLInputElement>('input[name="dwell"]:checked');
    if (el?.value) return el.value;
  } catch {
    // kein DOM/Radio -> Fallback unten
  }
  return "lang";
}

export default function Favorites() {
  const [last, setLast] = useState<Fav | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("ladeplanner:lastSpot");
      if (!raw) return;
      const s = JSON.parse(raw) as { name?: string; query?: string };
      const query = (s.query ?? "").trim();
      if (!query || isFixed(query)) return;
      const displayName = (s.name || query).split(",")[0]!.trim();
      const rest = (s.name || query).split(",").slice(1).join(",").trim();
      setLast({ icon: IconClock, name: displayName, sub: rest ? rest.toUpperCase() : "ZULETZT GESUCHT", query });
    } catch {
      // localStorage evtl. blockiert — dann nur die festen Spots zeigen.
    }
  }, []);

  const items = last ? [...FIXED, last] : FIXED;

  // Klick übernimmt die aktuell gewählte Aufenthalt-Stufe (statt fix "lang").
  // Das href bleibt als sinnvoller Fallback (No-JS / Mittelklick / neuer Tab).
  const go = (e: MouseEvent, query: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // neuer Tab: href nutzen
    e.preventDefault();
    window.location.href = planHref(query, currentDwell());
  };

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {items.map((f) => (
        <a key={f.name + f.query} className="row" href={planHref(f.query, "lang")} onClick={(e) => go(e, f.query)}>
          <span className="glyph">{f.icon}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</span>
            <span className="mono" style={{ display: "block", fontSize: 11, color: "var(--faint)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.sub}</span>
          </span>
          {IconChevron}
        </a>
      ))}
    </div>
  );
}
