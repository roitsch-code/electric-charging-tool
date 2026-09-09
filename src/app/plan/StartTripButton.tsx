"use client";

import { useState } from "react";

/**
 * "Losfahren"-Knopf (Konzept §6.4). Browser-Geolocation -> Fahrt anlegen
 * (POST /api/trips) -> Push wird geplant. Dark-Theme, Coral-Gradient.
 *
 * Die gerade ausgewählte Säule geht als `target` mit: ab 15 min vor Ankunft
 * prüft der Server im Minutentakt, ob sie noch frei ist, und schickt bei
 * "null frei" einen Push mit Alternative (src/lib/notify/watch.ts).
 */

export type TripTarget = {
  evseId: string;
  name: string;
  lat: number;
  lng: number;
  status: string;
  free: number | null;
  total: number | null;
};

type State =
  | { phase: "idle" }
  | { phase: "locating" }
  | { phase: "scheduling" }
  | {
      phase: "done";
      notifyAt: string;
      eta: string;
      leadMinutes: number;
      source: string;
      watchFrom: string | null;
      watchLead: number | null;
      targetName: string | null;
    }
  | { phase: "error"; message: string };

const ArrowIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export default function StartTripButton(props: {
  destLat: number;
  destLng: number;
  destName?: string;
  dwellMinutes: number | null;
  returnTripKm: number | null;
  target?: TripTarget | null;
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
          enableHighAccuracy: true, timeout: 15000, maximumAge: 0,
        });
      });
    } catch (e) {
      const err = e as GeolocationPositionError;
      setState({
        phase: "error",
        message: err?.code === 1
          ? "Standortfreigabe abgelehnt — bitte im Browser erlauben."
          : "Standort konnte nicht ermittelt werden.",
      });
      return;
    }

    setState({ phase: "scheduling" });
    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          lat: props.destLat, lng: props.destLng, name: props.destName,
          dwell: props.dwellMinutes, return: props.returnTripKm,
          target: props.target ?? undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean; notifyAt?: string; eta?: string; leadMinutes?: number; etaSource?: string; error?: string;
        watch?: { from: string; until: string; leadMinutes: number } | null;
      };
      if (!res.ok || !data.ok || !data.notifyAt || !data.eta) {
        setState({ phase: "error", message: data.error ?? "Fahrt konnte nicht angelegt werden." });
        return;
      }
      setState({
        phase: "done", notifyAt: data.notifyAt, eta: data.eta,
        leadMinutes: data.leadMinutes ?? 0, source: data.etaSource ?? "estimated",
        watchFrom: data.watch?.from ?? null,
        watchLead: data.watch?.leadMinutes ?? null,
        targetName: props.target?.name ?? null,
      });
    } catch {
      setState({ phase: "error", message: "Netzwerkfehler beim Anlegen der Fahrt." });
    }
  }

  if (state.phase === "done") {
    return (
      <div style={{ flex: 1, background: "rgba(95,216,146,0.08)", border: "1px solid rgba(95,216,146,0.22)", borderRadius: 15, padding: "13px 15px" }}>
        <div className="mono" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", color: "var(--free)", textTransform: "uppercase" }}>● Fahrt läuft</div>
        {/* Zwei Zeilen, nie mehr: die Kachel steht ganz unten im Viewport. */}
        <div style={{ fontSize: 13.5, color: "var(--fg)", marginTop: 5 }}>
          Push um <strong className="mono">{fmt(state.watchFrom ?? state.notifyAt)}</strong> Uhr
          {" · "}
          {state.watchFrom ? state.watchLead : state.leadMinutes} min vor Ankunft
        </div>
        <div className="mono" style={{ fontSize: 10, color: "var(--faint)", marginTop: 4, textTransform: "uppercase" }}>
          {state.source === "google" ? "ETA mit Live-Verkehr" : "ETA geschätzt"}
          {" · "}
          {state.watchFrom ? "Säule wird überwacht" : "Belegung wird live geprüft"}
        </div>
      </div>
    );
  }

  const busy = state.phase === "locating" || state.phase === "scheduling";
  return (
    <div style={{ flex: 1 }}>
      <button className="btn" onClick={start} disabled={busy} style={{ width: "100%" }}>
        {state.phase === "locating" ? "Standort…" : state.phase === "scheduling" ? "Anlegen…" : <>Losfahren {ArrowIcon}</>}
      </button>
      {state.phase === "error" && (
        <p style={{ color: "var(--broken)", fontSize: 12.5, marginTop: 8, marginBottom: 0 }}>{state.message}</p>
      )}
    </div>
  );
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}
