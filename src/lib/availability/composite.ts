import { haversineMeters } from "@/lib/chargers/geo";
import type { Coordinates } from "@/lib/resolver/types";
import type { AvailabilityProvider, AvailabilitySnapshot } from "./types";

/** Zwei Snapshots gelten als derselbe Ort, wenn sie so nah beieinander liegen. */
const SAME_PLACE_M = 40;

/**
 * Fuehrt mehrere Belegungsquellen zusammen (Fallback fuer Fallback).
 * Alle Provider werden parallel abgefragt; pro Ladeort gewinnt der bessere
 * Snapshot: bekannter Status schlaegt "unknown", danach der frischere.
 * Faellt ein Provider aus, zaehlen die anderen weiter.
 */
export class CompositeAvailabilityProvider implements AvailabilityProvider {
  constructor(private readonly providers: AvailabilityProvider[]) {}

  async near(center: Coordinates, radiusM: number): Promise<AvailabilitySnapshot[]> {
    const settled = await Promise.allSettled(
      this.providers.map((p) => p.near(center, radiusM)),
    );
    const all: AvailabilitySnapshot[] = settled.flatMap((r) =>
      r.status === "fulfilled" ? r.value : [],
    );
    return mergeSnapshots(all);
  }
}

function isKnown(s: AvailabilitySnapshot): boolean {
  return s.status !== "unknown";
}

/** Behaelt pro Ort den informativeren/frischeren Snapshot. */
export function mergeSnapshots(snapshots: AvailabilitySnapshot[]): AvailabilitySnapshot[] {
  const merged: AvailabilitySnapshot[] = [];
  for (const s of snapshots) {
    const idx = merged.findIndex(
      (m) => haversineMeters(m, s) <= SAME_PLACE_M,
    );
    if (idx === -1) {
      merged.push(s);
      continue;
    }
    merged[idx] = better(merged[idx]!, s);
  }
  return merged;
}

function better(a: AvailabilitySnapshot, b: AvailabilitySnapshot): AvailabilitySnapshot {
  // Bekannt schlaegt unbekannt.
  if (isKnown(a) !== isKnown(b)) return isKnown(a) ? a : b;
  // Sonst der frischere Zeitstempel.
  if (a.fetchedAt !== b.fetchedAt) return a.fetchedAt > b.fetchedAt ? a : b;
  // Tiebreak: mehr Gesamtpunkte (informativer).
  return b.total > a.total ? b : a;
}
