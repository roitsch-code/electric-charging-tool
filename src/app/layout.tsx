import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600"],
  variable: "--font-archivo",
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: "Ladeplanner",
  title: "Ladeplanner",
  description:
    "Zielzentrierte Ladeplanung für E-Autos: Laden am Zielort, nicht auf der Autobahn.",
  // Als Web-App auf dem iPhone-Homescreen: eigenständig (ohne Safari-Leiste),
  // Name unter dem Icon, durchscheinende Statusleiste (passt zum bestehenden
  // env(safe-area-inset-top)-Padding in globals.css). Icon (apple-icon.png) und
  // Favicon (icon.svg) liegen als Datei-Konvention in src/app/ und werden von
  // Next automatisch verlinkt; das Manifest kommt aus manifest.ts.
  appleWebApp: {
    capable: true,
    title: "Ladeplanner",
    statusBarStyle: "black-translucent",
  },
  // Next 15 gibt nur den modernen "mobile-web-app-capable"-Tag aus; das ältere
  // Apple-Pendant zusätzlich setzen, damit auch iOS < 16.4 standalone startet.
  other: { "apple-mobile-web-app-capable": "yes" },
};

// viewportFit: "cover" ist Voraussetzung, damit env(safe-area-inset-*) greift.
// maximumScale verhindert das iOS-Auto-Zoom auf Eingabefelder (löst Scroll aus).
export const viewport: Viewport = {
  themeColor: "#0A0A0C",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de" className={`${archivo.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
