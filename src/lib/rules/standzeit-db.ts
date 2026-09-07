import { prisma } from "@/lib/db";
import { normCity, type StandzeitRule, type StandzeitVerdict } from "./standzeit";

/**
 * Persistenz für recherchierte Standzeit-Regeln (der „Suche Standzeit"-Knopf).
 *
 * Bewusst eine schlanke, selbst-anlegende Tabelle per raw SQL — kein Prisma-
 * Migrationslauf nötig, damit das Feature auch auf dem Server ohne
 * `prisma migrate deploy` sofort funktioniert. Schlüssel ist (city_key,
 * connector); city_key ist die normalisierte Stadt (Umlaute entschärft).
 */

export interface SavedStandzeit extends StandzeitRule {
  /** Quelle (URL), auf der die Regel beruht — Pflicht beim Speichern. */
  source: string | null;
  /** Optionaler Zusatz (z. B. „E-Kennzeichen + Parkscheibe"). */
  note: string | null;
  /** Menschlich lesbarer Stadtname, wie recherchiert. */
  city: string;
}

type Kind = "ac" | "dc";

let tableReady: Promise<void> | null = null;

/** Legt die Tabelle einmalig an (idempotent, prozessweit gecacht). */
export function ensureCityRulesTable(): Promise<void> {
  if (!tableReady) {
    tableReady = prisma
      .$executeRaw`
        CREATE TABLE IF NOT EXISTS city_rules (
          city_key   text NOT NULL,
          connector  text NOT NULL,
          city       text NOT NULL,
          label      text NOT NULL,
          verdict    text NOT NULL,
          source     text,
          note       text,
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (city_key, connector)
        )
      `
      .then(() => undefined)
      .catch((e) => {
        // Beim Fehlschlag Cache leeren, damit ein späterer Aufruf neu versucht.
        tableReady = null;
        throw e;
      });
  }
  return tableReady;
}

interface RuleRow {
  label: string;
  verdict: string;
  source: string | null;
  note: string | null;
  city: string;
}

function toVerdict(v: string): StandzeitVerdict {
  return v === "free" || v === "limited" || v === "closed" ? v : "unknown";
}

/** Gespeicherte Regel nachschlagen (null, wenn keine da). Fehler -> null. */
export async function getSavedRule(
  city: string | undefined,
  connector: Kind,
): Promise<SavedStandzeit | null> {
  if (!city) return null;
  try {
    await ensureCityRulesTable();
    const key = normCity(city);
    const rows = await prisma.$queryRaw<RuleRow[]>`
      SELECT label, verdict, source, note, city
      FROM city_rules
      WHERE city_key = ${key} AND connector = ${connector}
      LIMIT 1
    `;
    const r = rows[0];
    if (!r) return null;
    return {
      label: r.label,
      verdict: toVerdict(r.verdict),
      source: r.source,
      note: r.note,
      city: r.city,
    };
  } catch {
    return null;
  }
}

/** Regel speichern/aktualisieren. Wirft bei DB-Fehler (Aufrufer entscheidet). */
export async function saveRule(input: {
  city: string;
  connector: Kind;
  label: string;
  verdict: StandzeitVerdict;
  source: string | null;
  note: string | null;
}): Promise<void> {
  await ensureCityRulesTable();
  const key = normCity(input.city);
  await prisma.$executeRaw`
    INSERT INTO city_rules (city_key, connector, city, label, verdict, source, note, updated_at)
    VALUES (${key}, ${input.connector}, ${input.city}, ${input.label}, ${input.verdict}, ${input.source}, ${input.note}, now())
    ON CONFLICT (city_key, connector) DO UPDATE SET
      city = EXCLUDED.city,
      label = EXCLUDED.label,
      verdict = EXCLUDED.verdict,
      source = EXCLUDED.source,
      note = EXCLUDED.note,
      updated_at = now()
  `;
}
