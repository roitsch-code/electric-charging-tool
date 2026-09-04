import { describe, it, expect, vi } from "vitest";
import { estimateEta, googleEta, computeEta } from "@/lib/notify/eta";

const HH = { lat: 53.5510, lng: 9.9215 }; // Hamburg
const B = { lat: 52.5200, lng: 13.4050 }; // Berlin ~255 km Luftlinie

describe("estimateEta (Fallback ohne Directions)", () => {
  it("liefert eine plausible Fahrzeit fuer HH->B", () => {
    const r = estimateEta(HH, B);
    expect(r.source).toBe("estimated");
    // ~255 km Luftlinie * 1,3 ~ 330 km Strecke
    expect(r.distanceKm).toBeGreaterThan(300);
    expect(r.distanceKm).toBeLessThan(360);
    // bei ~95 km/h grob 3,5 h
    expect(r.etaSeconds).toBeGreaterThan(3 * 3600);
    expect(r.etaSeconds).toBeLessThan(4.5 * 3600);
  });

  it("nutzt niedrige Stadtgeschwindigkeit fuer Kurzstrecke", () => {
    const near = { lat: 53.5510, lng: 9.9315 }; // ~0,7 km entfernt
    const r = estimateEta(HH, near);
    expect(r.distanceKm).toBeLessThan(2);
    expect(r.etaSeconds).toBeGreaterThan(0);
  });
});

describe("googleEta", () => {
  it("liest duration_in_traffic und distance aus", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          status: "OK",
          routes: [
            {
              legs: [
                {
                  distance: { value: 289000 },
                  duration: { value: 10800 },
                  duration_in_traffic: { value: 12000 },
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const r = await googleEta(HH, B, "KEY", fetchFn as unknown as typeof fetch);
    expect(r.source).toBe("google");
    expect(r.etaSeconds).toBe(12000); // traffic hat Vorrang vor duration
    expect(r.distanceKm).toBe(289);
    expect(fetchFn).toHaveBeenCalledOnce();
    const url = String((fetchFn.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("departure_time=now");
  });

  it("faellt auf duration zurueck, wenn kein traffic-Wert da ist", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          status: "OK",
          routes: [{ legs: [{ distance: { value: 5000 }, duration: { value: 600 } }] }],
        }),
        { status: 200 },
      ),
    );
    const r = await googleEta(HH, B, "KEY", fetchFn as unknown as typeof fetch);
    expect(r.etaSeconds).toBe(600);
    expect(r.distanceKm).toBe(5);
  });

  it("wirft bei Status != OK", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ status: "ZERO_RESULTS" }), { status: 200 }),
    );
    await expect(
      googleEta(HH, B, "KEY", fetchFn as unknown as typeof fetch),
    ).rejects.toThrow(/ZERO_RESULTS/);
  });
});

describe("computeEta", () => {
  it("ohne Key -> Schaetzung", async () => {
    const r = await computeEta(HH, B, { apiKey: null });
    expect(r.source).toBe("estimated");
  });

  it("mit Key -> Google", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          status: "OK",
          routes: [{ legs: [{ distance: { value: 10000 }, duration_in_traffic: { value: 900 } }] }],
        }),
        { status: 200 },
      ),
    );
    const r = await computeEta(HH, B, { apiKey: "KEY", fetchFn: fetchFn as unknown as typeof fetch });
    expect(r.source).toBe("google");
    expect(r.etaSeconds).toBe(900);
  });

  it("faellt bei Google-Fehler auf die Schaetzung zurueck", async () => {
    const fetchFn = vi.fn(async () => new Response("boom", { status: 500 }));
    const r = await computeEta(HH, B, { apiKey: "KEY", fetchFn: fetchFn as unknown as typeof fetch });
    expect(r.source).toBe("estimated");
  });
});
