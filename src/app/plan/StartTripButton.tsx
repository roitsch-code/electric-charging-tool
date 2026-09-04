"use client";

import { useState } from "react";

/**
 * "Losfahren"-Knopf (Konzept §6.4). Holt den aktuellen Standort per Browser-
 * Geolocation, legt eine Fahrt an (POST /api/trips) und zeigt an, wann der Push
 * kommt. Kein Geofencing, kein Dauer-Tracking — ein Zeitpunkt reicht (§6).
 *
 * Voraussetzung: HTTPS (haben wir) + Standortfreigabe im Browser.
 */

const C = {
  card: "#14181d",
  card2: "#1b2129",
  text: "#e6e8eb",
  muted: "#9aa2ac",
  accent: "#4ea1ff",
  green: "#3fbf7f",
  red: "#e0603b",
};

type State =
  | { phase: "idle" }
  | { phase: "locating" }
  | { phase: "scheduling" }
  | { phase: "done"; notifyAt: string; eta: string; leadMinutes: number; source: string }
  | { phase: "error"; message: string };

export default function StartTripButton(props: {
  destLat: number;
  destLng: number;
  destName?: string;
  dwellMinutes: number | null;
  returnTripKm: number | null;
}) {
  const [state, setState] = useState<State>({ phase: "idle" });

  async function start() {
    if (!("geolocation" in navigator)) {
      setState({ phase: "error", message: "Dieser Browser kann keinen Standort liefern." });
      return;
    }
    setState({ phase: "locating" });

    let pos: GeolocationPosition;
    try {
      pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });
    } catch (e) {
      const err = e as GeolocationPositionError;
      const msg =
        err?.code === 1
          ? "Standortfreigabe abgelehnt. Bitte in den Browser-Einstellungen erlauben."
          : "Standort konnte nicht ermittelt werden.";
      setState({ phase: "error", message: msg });
      return;
    }

    setState({ phase: "scheduling" });
    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          lat: props.destLat,
          lng: props.destLng,
          name: props.destName,
          dwell: props.dwellMinutes,
          return: props.returnTripKm,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        notifyAt?: string;
        eta?: string;
        leadMinutes?: number;
        etaSource?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.notifyAt || !data.eta) {
        setState({ phase: "error", message: data.error ?? "Fahrt konnte nicht angelegt werden." });
        return;
      }
      setState({
        phase: "done",
        notifyAt: data.notifyAt,
        eta: data.eta,
        leadMinutes: data.leadMinutes ?? 0,
        source: data.etaSource ?? "estimated",
      });
    } catch {
      setState({ phase: "error", message: "Netzwerkfehler beim Anlegen der Fahrt." });
    }
  }

  if (state.phase === "done") {
    return (
      <div
        style={{
          background: C.card,
          borderLeft: `3px solid ${C.green}`,
          borderRadius: 8,
          padding: "0.9rem 1rem",
          marginTop: "1.25rem",
        }}
      >
        <strong style={{ color: C.green }}>● Fahrt läuft</strong>
        <div style={{ color: C.text, fontSize: "0.9rem", marginTop: 6 }}>
          Push um <strong>{fmt(state.notifyAt)}</strong> Uhr (
          {state.leadMinutes} min vor Ankunft, geplant {fmt(state.eta)} Uhr).
        </div>
        <div style={{ color: C.muted, fontSize: "0.78rem", marginTop: 6 }}>
          {state.source === "google"
            ? "Ankunftszeit mit Live-Verkehr (Google)."
            : "Ankunftszeit geschätzt (ohne Verkehrsdaten)."}{" "}
          Die Belegung wird kurz vor dem Push erneut live geprüft.
        </div>
      </div>
    );
  }

  const busy = state.phase === "locating" || state.phase === "scheduling";
  return (
    <div style={{ marginTop: "1.25rem" }}>
      <button
        onClick={start}
        disabled={busy}
        style={{
          background: busy ? C.card2 : C.accent,
          color: busy ? C.muted : "#00121f",
          border: "none",
          borderRadius: 8,
          padding: "0.8rem 1.4rem",
          fontSize: "1rem",
          fontWeight: 700,
          cursor: busy ? "default" : "pointer",
          width: "100%",
        }}
      >
        {state.phase === "locating"
          ? "Standort wird geholt…"
          : state.phase === "scheduling"
            ? "Fahrt wird angelegt…"
            : "🚗 Losfahren — Push vor Ankunft"}
      </button>
      {state.phase === "error" && (
        <p style={{ color: C.red, fontSize: "0.85rem", marginTop: 8 }}>{state.message}</p>
      )}
      {state.phase === "idle" && (
        <p style={{ color: C.muted, fontSize: "0.78rem", marginTop: 8 }}>
          Fragt einmal den Standort ab und schickt dir kurz vor Ankunft eine
          Mitteilung mit der besten freien Ladesäule.
        </p>
      )}
    </div>
  );
}

/** ISO -> lokale HH:MM. */
function fmt(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
