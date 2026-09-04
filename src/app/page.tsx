export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "3rem 1.25rem" }}>
      <h1 style={{ fontSize: "1.9rem", marginBottom: "0.25rem" }}>Ladeplanner</h1>
      <p style={{ color: "#9aa2ac", marginTop: 0 }}>
        Zielzentrierte Ladeplanung für E-Autos. Laden am Zielort, nicht auf der
        Autobahn.
      </p>

      {/* Eingabe: Google-Maps-Link ODER Adresse einfuegen (kein Kurzbefehl noetig). */}
      <form
        method="get"
        action="/plan"
        style={{
          marginTop: "1.5rem",
          background: "#14181d",
          padding: "1rem",
          borderRadius: 12,
        }}
      >
        <label style={{ display: "block", fontSize: "0.85rem", color: "#9aa2ac", marginBottom: 6 }}>
          Google-Maps-Link einfügen oder Adresse eingeben
        </label>
        <input
          name="q"
          required
          placeholder="z. B. https://maps.app.goo.gl/… oder Große Elbstraße 39 Hamburg"
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "#0b0d10",
            border: "1px solid #1b2129",
            borderRadius: 8,
            color: "#e6e8eb",
            padding: "0.7rem 0.8rem",
            fontSize: "1rem",
          }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <select
            name="dwell"
            defaultValue="nacht"
            style={{
              flex: 1,
              minWidth: 160,
              background: "#0b0d10",
              border: "1px solid #1b2129",
              borderRadius: 8,
              color: "#e6e8eb",
              padding: "0.7rem 0.8rem",
              fontSize: "1rem",
            }}
          >
            <option value="kurz">Kurz (unter 1 h)</option>
            <option value="paar">Paar Stunden</option>
            <option value="nacht">Über Nacht</option>
            <option value="laenger">Länger</option>
          </select>
          <button
            type="submit"
            style={{
              background: "#4ea1ff",
              color: "#00121f",
              border: "none",
              borderRadius: 8,
              padding: "0.7rem 1.2rem",
              fontSize: "1rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Laden finden
          </button>
        </div>
      </form>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Status</h2>
        <ul style={{ lineHeight: 1.8 }}>
          <li>M1 — Resolver (Link → Koordinaten): erledigt</li>
          <li>M2 — DE-weiter Datenbestand (BNetzA-API, PostGIS): live</li>
          <li>M3 — Ranking + Ergebnisseite: erledigt</li>
          <li>M4 — Live-Belegung (TomTom, on-demand): live</li>
        </ul>
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Live-Demo (Seed-Daten)</h2>
        <ul style={{ lineHeight: 1.9 }}>
          <li>
            <a
              href="/plan?lat=53.5510&lng=9.9215&name=Gastwerk%20Hotel%20Hamburg&dwell=nacht"
              style={{ color: "#4ea1ff" }}
            >
              Gastwerk Hotel Hamburg — über Nacht
            </a>
          </li>
          <li>
            <a
              href="/plan?lat=53.5510&lng=9.9215&name=Gastwerk%20Hotel%20Hamburg&dwell=kurz&return=300"
              style={{ color: "#4ea1ff" }}
            >
              Gastwerk Hotel Hamburg — kurzer Halt, 300 km Rückfahrt
            </a>
          </li>
          <li>
            <a
              href="/plan?lat=53.2000&lng=7.5000&name=Landgasthof&dwell=paar"
              style={{ color: "#4ea1ff" }}
            >
              Ländliches Ziel — Radius-Erweiterung
            </a>
          </li>
        </ul>
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>API</h2>
        <pre
          style={{
            background: "#14181d",
            padding: "1rem",
            borderRadius: 8,
            overflowX: "auto",
            fontSize: "0.85rem",
          }}
        >
{`POST /api/destinations
  { "shareUrl": "https://maps.app.goo.gl/…",
    "dwellMinutes": 480, "returnTripKm": 0 }

GET  /api/destinations/:id`}
        </pre>
      </section>

      <p style={{ marginTop: "2rem", color: "#9aa2ac", fontSize: "0.85rem" }}>
        Details siehe <code>docs/konzept.md</code>.
      </p>
    </main>
  );
}
