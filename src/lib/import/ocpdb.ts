import type { Charger } from "../chargers/types";
import type { Connector } from "../vehicle";
import { deriveConnector, isValidCharger } from "./normalize";

/**
 * OCPDB / MobiData-BW-Importer fuer den STATISCHEN Bestand (Konzept §5.1).
 *
 * Warum zusaetzlich zu BNetzA/OCM: Dieser Feed nutzt dieselben
 * `BNETZA*<id>*<punkt>`-IDs wie der Realtime-Feed (realtime/mobidata.ts) —
 * nur so lassen sich Verfuegbarkeitsdaten den Ladepunkten zuordnen. Fuer
 * Baden-Wuerttemberg ist das die realtime-faehige Quelle.
 *
 * Endpunkt: .../ocpdb/api/public/datex/v3.5/json/static  (kein Key).
 */

export const OCPDB_STATIC_URL =
  "https://api.mobidata-bw.de/ocpdb/api/public/datex/v3.5/json/static";

const SOURCE = "ocpdb";

interface LocalizedValue {
  values?: Array<{ lang?: string; value?: string }>;
}
function localized(v: LocalizedValue | undefined): string | undefined {
  return v?.values?.find((x) => x.value)?.value;
}

interface ChargingPoint {
  idG?: string;
  currentType?: { value?: string };
  availableChargingPower?: number[];
  connector?: Array<{
    connectorType?: { value?: string };
    maxPowerAtSocket?: number;
  }>;
}
interface Station {
  refillPoint?: Array<{ aegiElectricChargingPoint?: ChargingPoint }>;
}
interface Site {
  locationReference?: {
    locAreaLocation?: { coordinatesForDisplay?: { latitude?: number; longitude?: number } };
    locPointLocation?: {
      locLocationExtensionG?: {
        FacilityLocation?: {
          address?: {
            postcode?: string;
            city?: LocalizedValue;
            addressLine?: Array<{ type?: { value?: string }; text?: LocalizedValue }>;
          };
        };
      };
    };
  };
  operator?: { afacAnOrganisation?: { name?: LocalizedValue } };
  energyInfrastructureStation?: Station[];
}
interface StaticPayload {
  payload?: {
    aegiEnergyInfrastructureTablePublication?: {
      energyInfrastructureTable?: Array<{ energyInfrastructureSite?: Site[] }>;
    };
  };
}

function siteAddress(site: Site): string | undefined {
  const a = site.locationReference?.locPointLocation?.locLocationExtensionG
    ?.FacilityLocation?.address;
  if (!a) return undefined;
  const street = a.addressLine?.find((l) => l.type?.value === "street");
  const houseNo = a.addressLine?.find((l) => l.type?.value === "houseNumber");
  const streetPart = [localized(street?.text), localized(houseNo?.text)]
    .filter(Boolean)
    .join(" ");
  const cityPart = [a.postcode, localized(a.city)].filter(Boolean).join(" ");
  return [streetPart, cityPart].filter(Boolean).join(", ") || undefined;
}

function pointPowerKw(cp: ChargingPoint): number | undefined {
  const fromAvailable = Math.max(0, ...(cp.availableChargingPower ?? [0]));
  const fromConnectors = Math.max(
    0,
    ...(cp.connector ?? []).map((c) => c.maxPowerAtSocket ?? 0),
  );
  const watts = Math.max(fromAvailable, fromConnectors);
  return watts > 0 ? Math.round(watts / 1000) : undefined;
}

export function parseOcpdbStatic(json: unknown): Charger[] {
  const data = (json ?? {}) as StaticPayload;
  const tables =
    data.payload?.aegiEnergyInfrastructureTablePublication
      ?.energyInfrastructureTable ?? [];

  const chargers: Charger[] = [];
  const seen = new Set<string>();

  for (const table of tables) {
    for (const site of table.energyInfrastructureSite ?? []) {
      const coords = site.locationReference?.locAreaLocation?.coordinatesForDisplay;
      const lat = coords?.latitude;
      const lng = coords?.longitude;
      if (typeof lat !== "number" || typeof lng !== "number") continue;

      const operator = localized(site.operator?.afacAnOrganisation?.name);
      const address = siteAddress(site);
      const city =
        localized(
          site.locationReference?.locPointLocation?.locLocationExtensionG
            ?.FacilityLocation?.address?.city,
        ) ?? "";

      for (const station of site.energyInfrastructureStation ?? []) {
        for (const rp of station.refillPoint ?? []) {
          const cp = rp.aegiElectricChargingPoint;
          const evseId = cp?.idG;
          if (!cp || !evseId || seen.has(evseId)) continue;
          seen.add(evseId);

          const powerKw = pointPowerKw(cp);
          const ct = (cp.currentType?.value ?? "").toLowerCase();
          const connector: Connector =
            ct === "dc" ? "dc" : ct === "ac" ? "ac" : deriveConnector({ powerKw });
          const connectorType = (cp.connector ?? [])
            .map((c) => c.connectorType?.value)
            .filter(Boolean)
            .join(", ");

          const charger: Partial<Charger> = {
            evseId,
            name: operator ? `${operator} ${city}`.trim() : `Ladepunkt ${city}`.trim(),
            lat,
            lng,
            operator: operator || undefined,
            powerKw: powerKw ?? undefined,
            connector,
            connectorType: connectorType || undefined,
            address,
            source: SOURCE,
            status: "unknown",
          };
          if (isValidCharger(charger)) chargers.push(charger);
        }
      }
    }
  }
  return chargers;
}

export async function fetchOcpdbStatic(url = OCPDB_STATIC_URL): Promise<Charger[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "ladeplanner/0.1 (n=1 hobby project)" },
  });
  if (!res.ok) throw new Error(`OCPDB static ${res.status}`);
  return parseOcpdbStatic(await res.json());
}
