/**
 * Push-Zeitpunkt (Konzept §3, Tabelle "Trigger-Zeitpunkt").
 *
 *   < 100 km   -> 5 min vor Ankunft  (nur noch die letzte Abbiegung)
 *   100–300 km -> 10 min             (Vorlauf fuer Umentscheidung)
 *   > 300 km   -> 15 min             (ggf. DC-Stopp vor dem Ziel)
 */
export function notifyLeadMinutes(totalDistanceKm: number): number {
  if (totalDistanceKm < 100) return 5;
  if (totalDistanceKm <= 300) return 10;
  return 15;
}

/** Zeitpunkt fuer den Push: ETA minus Vorlauf. */
export function computeNotifyAt(eta: Date, totalDistanceKm: number): Date {
  const lead = notifyLeadMinutes(totalDistanceKm);
  return new Date(eta.getTime() - lead * 60_000);
}

/**
 * Überwachung der angefahrenen Ladesäule (Notification-Pusher):
 * ab 15 min vor Ankunft im Minutentakt prüfen, ob sie noch frei ist.
 * Nach der ETA läuft die Überwachung noch eine Gnadenfrist weiter, weil die
 * ETA (gerade die geschätzte) einige Minuten daneben liegen kann.
 */
export const WATCH_LEAD_MINUTES = 15;
export const WATCH_GRACE_MINUTES = 10;

/** Fenster [von, bis], in dem die Säule überwacht wird. */
export function computeWatchWindow(eta: Date): { from: Date; until: Date } {
  return {
    from: new Date(eta.getTime() - WATCH_LEAD_MINUTES * 60_000),
    until: new Date(eta.getTime() + WATCH_GRACE_MINUTES * 60_000),
  };
}
