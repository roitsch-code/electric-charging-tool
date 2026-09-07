import { describe, it, expect } from "vitest";
import { resolveNightRule } from "@/lib/rules/nightfree";

describe("resolveNightRule", () => {
  it("Zeitfenster-Limit tagsüber -> nachts frei", () => {
    const r = resolveNightRule({ "maxstay:conditional": "3 hours @ (Mo-Sa 09:00-20:00)" });
    expect(r.verdict).toBe("free");
    expect(r.label).toContain("Nachts frei");
    expect(r.label).toContain("Mo–Sa 9–20 Uhr");
  });

  it("Limit rund um die Uhr -> auch nachts begrenzt", () => {
    const r = resolveNightRule({ maxstay: "3 hours" });
    expect(r.verdict).toBe("limited");
    expect(r.label).toContain("3 h");
  });

  it("Öffnungszeiten enden abends -> nachts geschlossen", () => {
    const r = resolveNightRule({ opening_hours: "Mo-Sa 08:00-20:00" });
    expect(r.verdict).toBe("closed");
    expect(r.label).toContain("geschlossen");
  });

  it("24/7 offen + Tages-Limit -> nachts frei", () => {
    const r = resolveNightRule({ opening_hours: "24/7", "maxstay:conditional": "1 hour @ (09:00-18:00)" });
    expect(r.verdict).toBe("free");
  });

  it("konditionales Limit das die Nacht abdeckt -> begrenzt", () => {
    const r = resolveNightRule({ "maxstay:conditional": "2 hours @ (00:00-24:00)" });
    // 00:00-24:00 deckt die Nacht -> nicht frei (Fenster inkludiert 23:00 & 05:00)
    expect(r.verdict).toBe("limited");
  });

  it("keine Tags -> unbekannt", () => {
    expect(resolveNightRule(null).verdict).toBe("unknown");
    expect(resolveNightRule({}).verdict).toBe("unknown");
  });

  it("maxstay unlimited -> unbekannt/keine Begrenzung", () => {
    expect(resolveNightRule({ maxstay: "unlimited" }).verdict).toBe("unknown");
  });
});
