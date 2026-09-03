import {
  driveToChargerUrl,
  spokenForPlan,
  walkFromChargerUrl,
  type PlanInput,
  type PlanResult,
} from "@/lib/chargers";
import type { Coordinates } from "@/lib/resolver/types";
import type { NtfyMessage } from "./ntfy";

/**
 * Baut die Push-Nachricht aus einem Plan (Konzept §6.6/§6.7):
 * vorzulesender Satz als Body, Deeplinks als Action-Buttons.
 */
export function buildPushMessage(
  topic: string,
  plan: PlanResult,
  input: PlanInput,
  destination: Coordinates,
): NtfyMessage {
  const message = spokenForPlan(plan, input, 0) ?? "Ladeplanner: kein Ergebnis.";
  const top = plan.top[0];

  const actions: NtfyMessage["actions"] = [];
  if (top) {
    actions.push({
      action: "view",
      label: "Hinfahren",
      url: driveToChargerUrl(top.charger),
    });
    actions.push({
      action: "view",
      label: "Zum Ziel",
      url: walkFromChargerUrl(top.charger, destination),
    });
  }

  return {
    topic,
    title: "Ladeplanner",
    message,
    tags: ["battery"],
    priority: 4,
    actions,
  };
}
