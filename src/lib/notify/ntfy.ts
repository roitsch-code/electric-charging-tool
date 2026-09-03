/**
 * ntfy.sh-Push (Konzept §6). Kein Apple Push Certificate, kein App Store:
 * Topic abonnieren, HTTP POST zum Senden.
 *
 * "Mitteilungen ankuendigen" (iOS) liest Titel + Nachricht vor. Deshalb:
 * - Titel bleibt ASCII ("Ladeplanner"); ntfy-Header vertragen kein UTF-8.
 * - Der vorzulesende deutsche Satz steht im BODY (Umlaute ok).
 * - Action-Buttons (Deeplinks) fuer den Fall, dass das Auto steht.
 */

export interface NtfyAction {
  action: "view";
  label: string; // ASCII halten (Header)
  url: string;
}

export interface NtfyMessage {
  topic: string;
  title: string;
  message: string;
  tags?: string[];
  priority?: 1 | 2 | 3 | 4 | 5;
  actions?: NtfyAction[];
}

type FetchFn = typeof fetch;

/** ntfy-"Actions"-Header: "view, Label, url; view, Label2, url2". */
function formatActions(actions: NtfyAction[]): string {
  return actions
    .map((a) => `${a.action}, ${a.label}, ${a.url}`)
    .join("; ");
}

export async function sendNtfy(
  msg: NtfyMessage,
  opts: { baseUrl?: string; fetchFn?: FetchFn } = {},
): Promise<{ ok: boolean; status: number }> {
  const base = opts.baseUrl ?? "https://ntfy.sh";
  const doFetch = opts.fetchFn ?? fetch;

  const headers: Record<string, string> = {
    Title: msg.title,
    "Content-Type": "text/plain; charset=utf-8",
  };
  if (msg.tags?.length) headers.Tags = msg.tags.join(",");
  if (msg.priority) headers.Priority = String(msg.priority);
  if (msg.actions?.length) headers.Actions = formatActions(msg.actions);

  const res = await doFetch(`${base}/${encodeURIComponent(msg.topic)}`, {
    method: "POST",
    headers,
    body: msg.message,
  });
  return { ok: res.ok, status: res.status };
}
