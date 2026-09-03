import type { UrlFollower } from "./types";

/**
 * Folgt den Redirects einer `maps.app.goo.gl`-Kurz-URL bis zur finalen
 * Google-Maps-URL (Konzept §4, Stufe 1). In Tests injiziert.
 *
 * fetch folgt Redirects standardmaessig; wir lesen `res.url` als finale
 * Adresse. `redirect: "follow"` ist explizit gesetzt, damit die Absicht
 * klar ist. Der Body wird verworfen — uns interessiert nur die URL.
 */

const TIMEOUT_MS = 8000;

export const followUrl: UrlFollower = async (shortUrl: string) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(shortUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        // Ein Desktop-User-Agent liefert die reichhaltigere /place/@lat,lng
        // URL statt einer abgespeckten Mobil-Variante.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });
    return res.url || shortUrl;
  } finally {
    clearTimeout(timer);
  }
};
