/**
 * Zeitpunkt dieses Builds. Wird als Build-Kennung UND als Umgebungswert
 * eingebacken, damit `/api/notify/diag` sagen kann, welcher Stand gerade
 * läuft. Ohne das ist von außen nicht zu erkennen, ob ein Deploy durch ist —
 * und dann wird jede Fehlersuche zum Ratespiel ("ist der Fix überhaupt drin?").
 */
const BUILD_ID = new Date().toISOString();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Fuer das Docker-Image (Hetzner-Deploy): schlanker Standalone-Server.
  output: "standalone",
  generateBuildId: async () => BUILD_ID,
  env: { LADEPLANNER_BUILD: BUILD_ID },
  // Prisma-Client + Query-Engine ins Standalone-Bundle zwingen (sonst fehlt die
  // Engine-Binary im Container und Routen mit DB-Zugriff crashen).
  outputFileTracingIncludes: {
    "/api/**": ["./src/generated/prisma/**/*"],
    "/plan": ["./src/generated/prisma/**/*"],
  },
};

export default nextConfig;
