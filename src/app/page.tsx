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
  { icon: IconHotel, name: "GINN Hotel", sub: "HAMBURG · ÜBER NACHT", href: "/plan?lat=53.5465&lng=9.9367&name=GINN%20Hotel%20Hamburg&dwell=lang" },
  { icon: IconHome, name: "Zuhause", sub: "LÜNEBURG", href: "/plan?lat=53.2465&lng=10.4141&name=Zuhause&dwell=lang" },
  { icon: IconSpa, name: "Kurhaus", sub: "BADEN-BADEN", href: "/plan?lat=48.7606&lng=8.2386&name=Kurhaus%20Baden-Baden&dwell=paar" },
];

export default function Home() {
  return (
    <main className="wrap" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <div className="bloom" style={{ top: -140, right: -90, width: 360, height: 360 }} />

      <div className="kicker">Ladeplanner</div>
      <h1 className="display" style={{ fontSize: 52, lineHeight: 1, fontWeight: 200, margin: "18px 0 26px" }}>
        Wohin?
      </h1>

      <form method="get" action="/plan" style={{ display: "flex", flexDirection: "column" }}>
        <div className="field">
          <span style={{ display: "flex" }}>{IconSearch}</span>
          <input name="q" required placeholder="Adresse oder Maps-Link" autoComplete="off" />
        </div>

        <div className="kicker" style={{ margin: "26px 2px 10px" }}>Aufenthalt</div>
        <div className="seg">
          <div><input type="radio" id="d-kurz" name="dwell" value="kurz" /><label htmlFor="d-kurz">Kurz</label></div>
          <div><input type="radio" id="d-paar" name="dwell" value="paar" /><label htmlFor="d-paar">2–3 Std</label></div>
          <div><input type="radio" id="d-lang" name="dwell" value="lang" defaultChecked /><label htmlFor="d-lang">Lang</label></div>
        </div>

        <div className="kicker" style={{ margin: "30px 2px 4px" }}>Zuletzt</div>
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

        <div style={{ flex: 1, minHeight: 26 }} />

        <button type="submit" className="btn">
          Laden finden {IconArrow}
        </button>
        <p className="mono" style={{ color: "var(--faint)", fontSize: 11, lineHeight: 1.55, marginTop: 16, textAlign: "center" }}>
          Ladepunkte in Gehweite deines Ziels — passend zu Auto und Aufenthalt. Belegung live.
        </p>
      </form>
    </main>
  );
}
