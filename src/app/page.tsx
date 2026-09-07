const IconSearch = (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" />
  </svg>
);
const IconArrow = (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const IconChevron = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--faint)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 6 6 6-6 6" />
  </svg>
);
const IconHotel = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
    <path d="M3 21h18M5 21V5h9v16M14 9h5v12M8 9h2M8 13h2" />
  </svg>
);
const IconHome = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
    <path d="m3 11 9-7 9 7M5 10v10h14V10" />
  </svg>
);
const IconSpa = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
    <path d="M12 3v18M5 8l7-5 7 5M5 8v13M19 8v13M3 21h18" />
  </svg>
);

const favorites = [
  { icon: IconHome, name: "Zuhause", sub: "ACKERSTRASSE · DÜSSELDORF", href: `/plan?q=${encodeURIComponent("Ackerstraße 199, 40233 Düsseldorf")}&dwell=lang` },
  { icon: IconHotel, name: "GINN Hotel", sub: "HAMBURG · ÜBER NACHT", href: `/plan?q=${encodeURIComponent("GINN Hotel Hamburg City")}&dwell=lang` },
  { icon: IconSpa, name: "Kurhaus", sub: "BADEN-BADEN", href: `/plan?q=${encodeURIComponent("Kurhaus Baden-Baden")}&dwell=paar` },
];

export default function Home() {
  return (
    <main className="wrap" style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div className="bloom" style={{ top: -120, right: -90, width: 420, height: 420, opacity: 0.95 }} />

      <div className="kicker" style={{ flex: "none" }}>Ladeplanner</div>
      <h1 className="display" style={{ fontSize: 46, lineHeight: 1, fontWeight: 200, margin: "12px 0 20px", flex: "none" }}>
        Wohin?
      </h1>

      <form method="get" action="/plan" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <div className="field" style={{ flex: "none" }}>
          <span style={{ display: "flex" }}>{IconSearch}</span>
          <input name="q" required placeholder="Adresse oder Maps-Link" autoComplete="off" />
        </div>

        <div className="kicker" style={{ margin: "20px 2px 10px", flex: "none" }}>Aufenthalt</div>
        <div className="seg" style={{ flex: "none" }}>
          <div><input type="radio" id="d-kurz" name="dwell" value="kurz" /><label htmlFor="d-kurz">Kurz</label></div>
          <div><input type="radio" id="d-paar" name="dwell" value="paar" /><label htmlFor="d-paar">2–3 Std</label></div>
          <div><input type="radio" id="d-lang" name="dwell" value="lang" defaultChecked /><label htmlFor="d-lang">Lang</label></div>
        </div>

        <div className="kicker" style={{ margin: "22px 2px 4px", flex: "none" }}>Ziele</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {favorites.map((f) => (
            <a key={f.name} className="row" href={f.href}>
              <span className="glyph">{f.icon}</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: "block", fontSize: 16 }}>{f.name}</span>
                <span className="mono" style={{ display: "block", fontSize: 11, color: "var(--faint)", marginTop: 2 }}>{f.sub}</span>
              </span>
              {IconChevron}
            </a>
          ))}
        </div>

        <div style={{ flex: 1, minHeight: 16 }} />

        <button type="submit" className="btn" style={{ flex: "none" }}>
          Laden finden {IconArrow}
        </button>
        <p className="mono" style={{ color: "var(--faint)", fontSize: 10.5, lineHeight: 1.5, margin: "12px 0 0", textAlign: "center", flex: "none" }}>
          Ladepunkte in Gehweite deines Ziels — passend zu Auto und Aufenthalt. Belegung live.
        </p>
      </form>
    </main>
  );
}
