/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Fuer das Docker-Image (Hetzner-Deploy): schlanker Standalone-Server.
  output: "standalone",
  // Prisma-Client + Query-Engine ins Standalone-Bundle zwingen (sonst fehlt die
  // Engine-Binary im Container und Routen mit DB-Zugriff crashen).
  outputFileTracingIncludes: {
    "/api/**": ["./src/generated/prisma/**/*"],
    "/plan": ["./src/generated/prisma/**/*"],
  },
};

export default nextConfig;
