/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Fuer das Docker-Image (Hetzner-Deploy): schlanker Standalone-Server.
  output: "standalone",
};

export default nextConfig;
