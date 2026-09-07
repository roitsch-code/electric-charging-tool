import Favorites from "./Favorites";

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

export default function Home() {
  return (
    <main className="wrap" style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div className="bloom" style={{ top: -120, right: -90, width: 420, height: 420, opacity: 0.95 }} />

      {/* variabler Freiraum oben — nimmt, was übrig bleibt; Content sitzt unten */}
      <div style={{ flex: "1 1 auto", minHeight: 12 }} />

      <div className="kicker" style={{ flex: "none" }}>Ladeplanner</div>
      <h1 className="display" style={{ fontSize: 46, lineHeight: 1, fontWeight: 200, margin: "12px 0 22px", flex: "none" }}>
        Wohin?
      </h1>

      <form method="get" action="/plan" style={{ display: "flex", flexDirection: "column", flex: "none" }}>
        <div className="field">
          <span style={{ display: "flex" }}>{IconSearch}</span>
          <input name="q" required placeholder="Adresse oder Maps-Link" autoComplete="off" />
        </div>

        <div className="kicker" style={{ margin: "22px 2px 10px" }}>Aufenthalt</div>
        <div className="seg">
          <div><input type="radio" id="d-kurz" name="dwell" value="kurz" /><label htmlFor="d-kurz">Kurz</label></div>
          <div><input type="radio" id="d-paar" name="dwell" value="paar" /><label htmlFor="d-paar">2–3 Std</label></div>
          <div><input type="radio" id="d-lang" name="dwell" value="lang" defaultChecked /><label htmlFor="d-lang">Lang</label></div>
        </div>

        <div className="kicker" style={{ margin: "24px 2px 4px" }}>Ziele</div>
        <Favorites />

        <button type="submit" className="btn" style={{ marginTop: 22 }}>
          Laden finden {IconArrow}
        </button>
      </form>
    </main>
  );
}
