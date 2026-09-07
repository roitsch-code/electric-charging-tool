"use client";

import { useEffect } from "react";

/**
 * Merkt sich die zuletzt geplante Fahrt in localStorage, damit die Startseite
 * sie als dritten Favoriten („letzter gesuchter Spot") anbieten kann. Rein
 * client-seitig, kein Server-State — n=1, ein Gerät.
 */
export default function RecordLastSpot({
  name,
  query,
  dwell,
}: {
  name: string;
  query: string;
  dwell: string;
}) {
  useEffect(() => {
    try {
      if (!query.trim()) return;
      localStorage.setItem(
        "ladeplanner:lastSpot",
        JSON.stringify({ name, query, dwell, ts: Date.now() }),
      );
    } catch {
      // localStorage kann blockiert sein (privater Modus) — dann eben nicht.
    }
  }, [name, query, dwell]);

  return null;
}
