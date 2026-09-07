import { describe, it, expect } from "vitest";
import { extractJson } from "@/lib/rules/standzeit-research";

describe("extractJson — Modellausgabe robust parsen", () => {
  it("liest den ```json``` Fenced Block", () => {
    const text = [
      "Nach Recherche der Stadt Emmerich:",
      "```json",
      '{ "found": true, "label": "Max. 2 Std · 20–8 Uhr frei", "verdict": "free", "source": "https://emmerich.de/x", "note": null }',
      "```",
    ].join("\n");
    const obj = extractJson(text);
    expect(obj?.found).toBe(true);
    expect(obj?.label).toBe("Max. 2 Std · 20–8 Uhr frei");
    expect(obj?.source).toBe("https://emmerich.de/x");
  });

  it("nimmt den LETZTEN JSON-Block, wenn mehrere da sind", () => {
    const text = [
      '```json\n{ "found": false }\n```',
      "Korrektur:",
      '```json\n{ "found": true, "label": "Max. 4 Std", "source": "https://a.de" }\n```',
    ].join("\n");
    expect(extractJson(text)?.found).toBe(true);
  });

  it("fällt auf das rohe {..} zurück, wenn kein Fence da ist", () => {
    const text = 'Ergebnis: { "found": true, "source": "https://b.de" } — Ende.';
    expect(extractJson(text)?.source).toBe("https://b.de");
  });

  it("gibt null bei fehlendem/kaputtem JSON", () => {
    expect(extractJson("kein json hier")).toBeNull();
    expect(extractJson("```json\n{ kaputt: }\n```")).toBeNull();
  });
});
