import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Ladeplanner",
  description:
    "Zielzentrierte Ladeplanung für E-Autos: Laden am Zielort, nicht auf der Autobahn.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          background: "#0b0d10",
          color: "#e6e8eb",
        }}
      >
        {children}
      </body>
    </html>
  );
}
