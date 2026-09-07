import Anthropic from "@anthropic-ai/sdk";
import type { StandzeitVerdict } from "./standzeit";

/**
 * Rechercheergebnis einer Standzeit-Suche. `found=false` heißt: keine
 * belastbare, mit Quelle belegte Regel gefunden — dann wird NICHTS gespeichert
 * (keine erfundenen Werte).
 */
export interface ResearchResult {
  found: boolean;
  label: string;
  verdict: StandzeitVerdict;
  source: string | null;
  note: string | null;
}

type Kind = "ac" | "dc";

// Recherche ist selten (n=1, nur bei unbekannten Orten) und juristisch heikel
// -> das stärkere Modell. Websuche als Server-Tool (Anthropic führt sie aus).
const MODEL = "claude-opus-5";
const WEB_SEARCH_TOOL = "web_search_20260209";

const SYSTEM = [
  "Du recherchierst die kommunale Parkregel (Höchstparkdauer) an ÖFFENTLICHEN",
  "Ladesäulen in einer deutschen Stadt. Nutze die Websuche und stütze dich auf",
  "offizielle Quellen: Stadt/Kommune, das örtliche Stadtwerk oder den Betreiber.",
  "Gib NUR mit Quelle belegte Angaben zurück. Findest du keine verlässliche",
  "Regel, sag das ehrlich (found=false). Erfinde NICHTS und rate nicht.",
].join(" ");

function userPrompt(city: string, connector: Kind): string {
  const art =
    connector === "dc"
      ? "DC-Schnelllader (Gleichstrom, hohe Leistung)"
      : "AC-Normallader (Wechselstrom, z. B. 11/22 kW)";
  return [
    `Stadt: ${city}. Ladeart: ${art}.`,
    "Frage: Wie lange darf man dort an einer öffentlichen Ladesäule dieser Art",
    "parken (Höchstparkdauer)? Gilt die Begrenzung nur zu bestimmten Uhrzeiten,",
    "und ist es nachts / außerhalb dieser Zeiten frei?",
    "",
    "Antworte am ENDE mit genau einem JSON-Block (```json ... ```), Felder:",
    '- "found": true nur, wenn du eine mit Quelle belegte Regel hast, sonst false.',
    '- "label": kurzer deutscher Text im Format "Max. 4 Std · 21–9 Uhr frei"',
    '  oder mit aktivem Fenster "Max. 1 Std (9–20 Uhr) · 20–9 Uhr frei".',
    '  Ohne bekannte Zeitbegrenzung: "Nur während des Ladens · Höchstparkdauer laut Schild".',
    '- "verdict": "free" wenn nachts/außerhalb frei, "limited" wenn durchgehend',
    '  begrenzt, "unknown" wenn nicht gefunden.',
    '- "source": URL der belegenden Quelle (oder null).',
    '- "note": kurzer Zusatz (z. B. "E-Kennzeichen + Parkscheibe") oder null.',
  ].join("\n");
}

/** Extrahiert den letzten ```json…``` Block (oder das letzte {...}) als Objekt. */
export function extractJson(text: string): Record<string, unknown> | null {
  const fenced = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)];
  const candidates = fenced.length
    ? fenced.map((m) => m[1]!)
    : (() => {
        const first = text.indexOf("{");
        const last = text.lastIndexOf("}");
        return first >= 0 && last > first ? [text.slice(first, last + 1)] : [];
      })();
  for (let i = candidates.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(candidates[i]!.trim());
      if (obj && typeof obj === "object") return obj as Record<string, unknown>;
    } catch {
      /* nächsten Kandidaten probieren */
    }
  }
  return null;
}

function collectText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

const NO_RULE: ResearchResult = {
  found: false,
  label: "Nur während des Ladens · Höchstparkdauer laut Schild",
  verdict: "unknown",
  source: null,
  note: null,
};

/**
 * Recherchiert die Standzeit-Regel für Stadt + Ladeart. Wirft nicht — bei
 * jedem Problem (kein Key, API-Fehler, kein JSON) kommt ein ehrliches
 * `found=false` zurück, damit der Aufrufer nichts Erfundenes speichert.
 */
export async function researchStandzeit(
  city: string,
  connector: Kind,
): Promise<ResearchResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NO_RULE;

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM,
      tools: [{ type: WEB_SEARCH_TOOL, name: "web_search", max_uses: 6 } as never],
      messages: [{ role: "user", content: userPrompt(city, connector) }],
    });

    const obj = extractJson(collectText(msg.content));
    if (!obj) return NO_RULE;

    const found = obj.found === true;
    const source = typeof obj.source === "string" ? obj.source.trim() : "";
    const label = typeof obj.label === "string" ? obj.label.trim() : "";
    const rawVerdict = typeof obj.verdict === "string" ? obj.verdict : "unknown";
    const verdict: StandzeitVerdict =
      rawVerdict === "free" || rawVerdict === "limited" || rawVerdict === "closed"
        ? rawVerdict
        : "unknown";
    const note = typeof obj.note === "string" && obj.note.trim() ? obj.note.trim() : null;

    // Halluzinations-Schutz: nur mit echter Quelle (URL) und Label als „gefunden".
    const hasSource = /^https?:\/\//i.test(source);
    if (!found || !hasSource || !label) return NO_RULE;

    return { found: true, label, verdict, source, note };
  } catch {
    return NO_RULE;
  }
}
