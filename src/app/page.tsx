export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "3rem 1.25rem" }}>
      <h1 style={{ fontSize: "1.9rem", marginBottom: "0.25rem" }}>Ladeplanner</h1>
      <p style={{ color: "#9aa2ac", marginTop: 0 }}>
        Zielzentrierte Ladeplanung fuer E-Autos. Laden am Zielort, nicht auf der
        Autobahn.
      </p>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Status</h2>
        <ul style={{ lineHeight: 1.8 }}>
          <li>M0 — Scaffold (Next.js, TypeScript, Prisma, CI): erledigt</li>
          <li>M1 — Resolver (Share-URL → Koordinaten, 3 Stufen): erledigt</li>
          <li>M3 — Ranking + Ergebnisseite (Seed-Daten): erledigt</li>
          <li>M2 — Statischer Datenbestand (BNetzA/OCM, PostGIS): offen</li>
          <li>M4 — Realtime + Push: offen</li>
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
              Gastwerk Hotel Hamburg — ueber Nacht
            </a>
          </li>
          <li>
            <a
              href="/plan?lat=53.5510&lng=9.9215&name=Gastwerk%20Hotel%20Hamburg&dwell=kurz&return=300"
              style={{ color: "#4ea1ff" }}
            >
              Gastwerk Hotel Hamburg — kurzer Halt, 300 km Rueckfahrt
            </a>
          </li>
          <li>
            <a
              href="/plan?lat=53.2000&lng=7.5000&name=Landgasthof&dwell=paar"
              style={{ color: "#4ea1ff" }}
            >
              Laendliches Ziel — Radius-Erweiterung
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
