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
 * ab `watchLeadMinutes` vor Ankunft im Minutentakt prüfen, ob sie noch frei
 * ist. Nach der ETA läuft die Überwachung noch eine Gnadenfrist weiter, weil
 * die ETA (gerade die geschätzte) einige Minuten daneben liegen kann.
 */
export const WATCH_LEAD_MINUTES = 15;
export const WATCH_GRACE_MINUTES = 10;

/**
 * Vorlauf für die Verifikation, abhängig von der RESTFAHRZEIT.
 *
 * Feste 15 Minuten gehen auf Kurzstrecke nicht auf: Wer noch zehn Minuten
 * fährt, bekäme den Push fünf Minuten BEVOR er losfährt — oder gar nicht,
 * weil das Fenster schon vorbei ist, wenn er den Knopf drückt. Der Vorlauf
 * skaliert deshalb mit; er bleibt immer eine Meldung von unterwegs, kurz
 * genug vor der Ankunft, dass die Antwort noch stimmt, und früh genug, um
 * umzudisponieren:
 *
 *   ab 25 min Fahrt  -> 15 min vorher
 *   15–25 min        -> 10 min vorher
 *    8–15 min        ->  5 min vorher
 *   unter 8 min      ->  3 min vorher
 *
 * Zusätzlich gedeckelt auf `Fahrzeit − 1`: Der Vorlauf darf nie größer als
 * die Fahrt selbst sein, sonst läge er in der Vergangenheit. Bei einer
 * Zwei-Minuten-Fahrt bleibt eine Minute — gerade genug für einen Tick.
 */
export function watchLeadMinutes(driveMinutes: number): number {
  const regel = driveMinutes >= 25 ? 15 : driveMinutes >= 15 ? 10 : driveMinutes >= 8 ? 5 : 3;
  return Math.max(1, Math.min(regel, Math.floor(driveMinutes) - 1));
}

/**
 * Fenster [von, bis], in dem die Säule überwacht wird.
 *
 * @param driveMinutes Restfahrzeit ab jetzt; ohne Angabe die festen 15 min.
 */
export function computeWatchWindow(
  eta: Date,
  driveMinutes?: number,
): { from: Date; until: Date; leadMinutes: number } {
  const lead =
    typeof driveMinutes === "number" ? watchLeadMinutes(driveMinutes) : WATCH_LEAD_MINUTES;
  return {
    from: new Date(eta.getTime() - lead * 60_000),
    until: new Date(eta.getTime() + WATCH_GRACE_MINUTES * 60_000),
    leadMinutes: lead,
  };
}
