import { describe, it, expect, vi } from "vitest";
import { planDestination } from "@/lib/chargers";
import { buildPushMessage } from "@/lib/notify/message";
import { sendNtfy } from "@/lib/notify/ntfy";

const GASTWERK = { lat: 53.551, lng: 9.9215, name: "Gastwerk Hotel Hamburg" };

describe("buildPushMessage (Konzept §6.6/§6.7)", () => {
  it("Titel ist ASCII, Body traegt den Sprechsatz, zwei Deeplink-Actions", async () => {
    const input = { dwellMinutes: 480, returnTripKm: null };
    const plan = await planDestination(GASTWERK, input);
    const msg = buildPushMessage("mein-topic", plan, input, GASTWERK);

    expect(msg.title).toBe("Ladeplanner");
    // Titel muss ASCII sein (ntfy-Header)
    expect(/^[\x00-\x7F]*$/.test(msg.title)).toBe(true);
    expect(msg.message).toContain("Ladeplanner:");
    expect(msg.message).toContain("Reicht über Nacht");

    expect(msg.actions).toHaveLength(2);
    expect(msg.actions![0]!.label).toBe("Hinfahren");
    expect(msg.actions![0]!.url).toContain("google.com/maps/dir");
    expect(msg.actions![1]!.label).toBe("Zum Ziel");
    expect(msg.actions![1]!.url).toContain("travelmode=walking");
  });
});

describe("sendNtfy", () => {
  it("POSTet an ntfy mit Titel-, Actions- und Body-Feldern", async () => {
    const fake = vi.fn(
      (_url: string, _init?: RequestInit): Promise<Response> =>
        Promise.resolve(new Response("ok", { status: 200 })),
    );
    const res = await sendNtfy(
      {
        topic: "mein-topic",
        title: "Ladeplanner",
        message: "Test über Nacht",
        actions: [{ action: "view", label: "Hinfahren", url: "https://maps.example/x" }],
        priority: 4,
      },
      { fetchFn: fake as unknown as typeof fetch },
    );

    expect(res.ok).toBe(true);
    expect(fake).toHaveBeenCalledOnce();
    const [url, init] = fake.mock.calls[0]!;
    expect(url).toBe("https://ntfy.sh/mein-topic");
    expect(init!.method).toBe("POST");
    const headers = init!.headers as Record<string, string>;
    expect(headers.Title).toBe("Ladeplanner");
    expect(headers.Actions).toContain("view, Hinfahren, https://maps.example/x");
    expect(init!.body).toBe("Test über Nacht");
  });

  it("nutzt eine alternative baseUrl (self-hosted ntfy)", async () => {
    const fake = vi.fn(
      (_url: string, _init?: RequestInit): Promise<Response> =>
        Promise.resolve(new Response("ok", { status: 200 })),
    );
    await sendNtfy(
      { topic: "t", title: "Ladeplanner", message: "x" },
      { baseUrl: "https://ntfy.example.com", fetchFn: fake as unknown as typeof fetch },
    );
    expect(fake.mock.calls[0]![0]).toBe("https://ntfy.example.com/t");
  });
});
