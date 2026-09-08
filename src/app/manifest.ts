import type { MetadataRoute } from "next";

// Web-App-Manifest — damit sich der Ladeplanner als eigenständige App zum
// iPhone-Homescreen (und Android) hinzufügen lässt. Next verlinkt diese Datei
// automatisch im <head> (rel="manifest").
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ladeplanner",
    short_name: "Ladeplanner",
    description:
      "Zielzentrierte Ladeplanung fürs E-Auto: Laden am Zielort, nicht auf der Autobahn.",
    lang: "de",
    start_url: "/",
    display: "standalone",
    background_color: "#0A0A0C",
    theme_color: "#0A0A0C",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
