import type { ChargerStatus } from "../chargers/types";

/** Ein normalisierter Verfuegbarkeitsstatus aus einem Realtime-Feed. */
export interface StatusRecord {
  evseId: string;
  status: ChargerStatus;
  /** ISO-Zeitstempel der letzten Aktualisierung (Ehrlichkeitsgebot §5.1). */
  lastUpdated: string;
  source: string;
}
