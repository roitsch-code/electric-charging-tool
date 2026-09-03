import { extractCoordinates } from "./extractCoordinates";
import { extractPlaceName } from "./extractPlaceName";
import { followUrl as defaultFollowUrl } from "./followUrl";
import { geocode as defaultGeocode } from "./geocode";
import type {
  Geocoder,
  ResolutionResult,
  UrlFollower,
} from "./types";

export interface ResolveDeps {
  followUrl?: UrlFollower;
  geocode?: Geocoder;
}

/**
 * Dreistufige Aufloesung einer geteilten Google-Maps-URL zu Koordinaten
 * (Konzept §4).
 *
 *   Stufe 1  Redirect folgen, Koordinaten aus der finalen URL regexen.
 *   Stufe 2  Falls keine Koordinaten: Ortsnamen aus der URL geocodieren.
 *   Stufe 3  Falls auch das scheitert: manuellen Fallback anfordern
 *            (App zeigt Eingabefeld). Der bereits extrahierte Name geht
 *            als Vorbelegung mit.
 *
 * Abhaengigkeiten sind injizierbar, damit der Resolver ohne Netz gegen
 * Fixtures echter URLs getestet werden kann.
 */
export async function resolveShareUrl(
  shareUrl: string,
  deps: ResolveDeps = {},
): Promise<ResolutionResult> {
  const followUrl = deps.followUrl ?? defaultFollowUrl;
  const geocode = deps.geocode ?? defaultGeocode;

  const trimmed = shareUrl.trim();
  if (!trimmed) {
    return {
      ok: false,
      needsManualInput: true,
      reason: "empty-url",
    };
  }

  // --- Stufe 1: Redirect folgen + Koordinaten parsen ---
  let finalUrl = trimmed;
  try {
    finalUrl = await followUrl(trimmed);
  } catch {
    // Redirect fehlgeschlagen. Wir versuchen trotzdem, die Eingabe-URL
    // direkt zu parsen — vielleicht war es schon eine volle Maps-URL.
    finalUrl = trimmed;
  }

  const placeName = extractPlaceName(finalUrl) ?? undefined;

  const coords = extractCoordinates(finalUrl);
  if (coords) {
    return {
      ok: true,
      lat: coords.lat,
      lng: coords.lng,
      name: placeName,
      method: "redirect",
    };
  }

  // --- Stufe 2: Ortsnamen geocodieren ---
  if (placeName) {
    try {
      const geo = await geocode(placeName);
      if (geo) {
        return {
          ok: true,
          lat: geo.lat,
          lng: geo.lng,
          name: geo.name ?? placeName,
          method: "geocode",
        };
      }
    } catch {
      // Geocoder-Fehler faellt unten in den manuellen Fallback.
    }
  }

  // --- Stufe 3: manueller Fallback ---
  return {
    ok: false,
    needsManualInput: true,
    placeNameHint: placeName,
    reason: placeName ? "geocode-failed" : "no-coordinates-no-name",
  };
}

/**
 * Stufe 3 explizit: der Nutzer hat eine Adresse eingetippt. Das ist reines
 * Geocoding und liefert method "manual".
 */
export async function resolveManualAddress(
  address: string,
  deps: ResolveDeps = {},
): Promise<ResolutionResult> {
  const geocode = deps.geocode ?? defaultGeocode;
  const trimmed = address.trim();
  if (!trimmed) {
    return { ok: false, needsManualInput: true, reason: "empty-address" };
  }
  try {
    const geo = await geocode(trimmed);
    if (geo) {
      return {
        ok: true,
        lat: geo.lat,
        lng: geo.lng,
        name: geo.name ?? trimmed,
        method: "manual",
      };
    }
  } catch {
    // faellt durch
  }
  return {
    ok: false,
    needsManualInput: true,
    placeNameHint: trimmed,
    reason: "manual-geocode-failed",
  };
}
