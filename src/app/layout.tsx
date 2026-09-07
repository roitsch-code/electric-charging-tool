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
  title: "Ladeplanner",
  description:
    "Zielzentrierte Ladeplanung für E-Autos: Laden am Zielort, nicht auf der Autobahn.",
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
