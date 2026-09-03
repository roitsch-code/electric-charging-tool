import type { Geocoder, ResolvedDestination } from "./types";

/**
 * Geocoding fuer Stufe 2 und den manuellen Fallback (Stufe 3).
 *
 * Bewusst Photon (Komoot, EU-gehostet) mit Nominatim als Fallback statt
 * Google Places: kein API-Key, kein Kontingent, keine Kosten (Konzept §4).
 *
 * Nominatim verlangt einen aussagekraeftigen User-Agent und begrenzt auf
 * 1 Request/Sekunde — fuer ein n=1-Projekt unkritisch.
 */

const PHOTON_URL = "https://photon.komoot.io/api/";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT =
  "ladeplanner/0.1 (n=1 hobby project; https://github.com/roitsch-code/electric-charging-tool)";
const TIMEOUT_MS = 5000;

async function fetchJson(url: string, headers: Record<string, string> = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, ...headers },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: { name?: string; city?: string; street?: string };
}
interface PhotonResponse {
  features?: PhotonFeature[];
}

async function geocodePhoton(query: string): Promise<ResolvedDestination | null> {
  const url = `${PHOTON_URL}?q=${encodeURIComponent(query)}&limit=1&lang=de`;
  const data = (await fetchJson(url)) as PhotonResponse | null;
  const feature = data?.features?.[0];
  const coords = feature?.geometry?.coordinates;
  if (!coords || coords.length !== 2) return null;
  const [lng, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    name: feature?.properties?.name ?? query,
    method: "geocode",
  };
}

interface NominatimResult {
  lat?: string;
  lon?: string;
  display_name?: string;
}

async function geocodeNominatim(
  query: string,
): Promise<ResolvedDestination | null> {
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=jsonv2&limit=1`;
  const data = (await fetchJson(url)) as NominatimResult[] | null;
  const first = Array.isArray(data) ? data[0] : null;
  if (!first?.lat || !first?.lon) return null;
  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    name: first.display_name ?? query,
    method: "geocode",
  };
}

/**
 * Produktions-Geocoder: erst Photon, bei Misserfolg Nominatim.
 * Fuer Tests wird stattdessen ein Fake-Geocoder injiziert.
 */
export const geocode: Geocoder = async (query: string) => {
  if (!query.trim()) return null;
  const viaPhoton = await geocodePhoton(query);
  if (viaPhoton) return viaPhoton;
  return geocodeNominatim(query);
};
