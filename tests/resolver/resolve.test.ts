import { describe, it, expect, vi } from "vitest";
import { resolveShareUrl, resolveManualAddress } from "@/lib/resolver/resolve";
import type { Geocoder, UrlFollower } from "@/lib/resolver/types";
import { redirectCases } from "./fixtures";

/** followUrl-Fake aus den Redirect-Fixtures. */
function makeFollower(): UrlFollower {
  const map = new Map(redirectCases.map((c) => [c.shortUrl, c.finalUrl]));
  return async (shortUrl: string) => map.get(shortUrl) ?? shortUrl;
}

/** Geocoder-Fake: liefert feste Koordinaten fuer jeden nichtleeren Namen. */
const fakeGeocode: Geocoder = async (query: string) => {
  if (!query.trim()) return null;
  return { lat: 48.7606, lng: 8.2396, name: query, method: "geocode" };
};

describe("resolveShareUrl (dreistufige Aufloesung)", () => {
  const followUrl = makeFollower();

  for (const c of redirectCases) {
    it(`${c.id}: ${c.note}`, async () => {
      const result = await resolveShareUrl(c.shortUrl, {
        followUrl,
        geocode: fakeGeocode,
      });
      expect(result.ok).toBe(c.expect.ok);
      if (c.expect.ok && result.ok) {
        expect(result.method).toBe(c.expect.method);
        if (c.expect.lat !== undefined) {
          expect(result.lat).toBeCloseTo(c.expect.lat, 6);
          expect(result.lng!).toBeCloseTo(c.expect.lng!, 6);
        }
        if (c.expect.name) expect(result.name).toBe(c.expect.name);
      }
      if (!c.expect.ok && !result.ok) {
        expect(result.needsManualInput).toBe(true);
      }
    });
  }

  it("ruft den Geocoder NICHT auf, wenn Stufe 1 Koordinaten liefert", async () => {
    const spy = vi.fn(fakeGeocode);
    await resolveShareUrl("https://maps.app.goo.gl/AAAA1111", {
      followUrl,
      geocode: spy,
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("faellt auf manuell zurueck, wenn der Geocoder null liefert", async () => {
    const result = await resolveShareUrl("https://maps.app.goo.gl/BBBB2222", {
      followUrl,
      geocode: async () => null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.needsManualInput).toBe(true);
      expect(result.placeNameHint).toBe("Kurhaus Baden-Baden");
      expect(result.reason).toBe("geocode-failed");
    }
  });

  it("ueberlebt einen Redirect-Fehler und parst die Eingabe-URL direkt", async () => {
    const throwing: UrlFollower = async () => {
      throw new Error("network down");
    };
    const result = await resolveShareUrl(
      "https://www.google.com/maps?q=53.5503,9.9200",
      { followUrl: throwing, geocode: fakeGeocode },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.lat).toBeCloseTo(53.5503, 6);
      expect(result.method).toBe("redirect");
    }
  });

  it("ueberlebt einen werfenden Geocoder", async () => {
    const throwing: Geocoder = async () => {
      throw new Error("geocoder down");
    };
    const result = await resolveShareUrl("https://maps.app.goo.gl/BBBB2222", {
      followUrl,
      geocode: throwing,
    });
    expect(result.ok).toBe(false);
  });

  it("liefert manuellen Fallback bei leerer URL", async () => {
    const result = await resolveShareUrl("   ", { followUrl, geocode: fakeGeocode });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("empty-url");
  });
});

describe("resolveManualAddress (Stufe 3, explizit)", () => {
  it("geocodiert eine eingetippte Adresse mit method manual", async () => {
    const result = await resolveManualAddress("Lichtentaler Allee, Baden-Baden", {
      geocode: fakeGeocode,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.method).toBe("manual");
  });

  it("meldet Fehlschlag, wenn der Geocoder nichts findet", async () => {
    const result = await resolveManualAddress("qwertzuiop", {
      geocode: async () => null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("manual-geocode-failed");
  });

  it("lehnt eine leere Adresse ab", async () => {
    const result = await resolveManualAddress("", { geocode: fakeGeocode });
    expect(result.ok).toBe(false);
  });
});
