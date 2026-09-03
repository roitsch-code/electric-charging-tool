import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../fixtures/share-urls/", import.meta.url));

function load<T>(name: string): T {
  return JSON.parse(readFileSync(dir + name, "utf8")) as T;
}

export interface ResolvedUrlCase {
  id: string;
  note: string;
  url: string;
  expectCoords: { lat: number; lng: number } | null;
  expectName: string | null;
}

export interface RedirectCase {
  id: string;
  note: string;
  shortUrl: string;
  finalUrl: string;
  expect: {
    ok: boolean;
    lat?: number;
    lng?: number;
    method?: string;
    name?: string;
    needsManualInput?: boolean;
  };
}

export const resolvedUrlCases = load<ResolvedUrlCase[]>("resolved-urls.json");
export const redirectCases = load<RedirectCase[]>("redirects.json");
