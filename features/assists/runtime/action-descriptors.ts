/**
 * Human descriptions of what accepting an assist WILL DO — shown on the
 * expanded card BEFORE anything runs, and used for the receipt AFTER.
 *
 * THE INTENTIONAL-ACTION LAW (Arman, 2026-08-08): an assist never runs from
 * an ambiguous gesture. The user sees the full card, reads exactly what the
 * action does, and clicks a verb-labeled button. Every new action kind MUST
 * add its descriptor here — a kind without one renders a disabled action.
 */

import type { AssistAction } from "../types";

export interface AssistActionDescriptor {
  /** The button label — an imperative verb phrase, 1-3 words. */
  verb: string;
  /** One sentence, plain words: exactly what happens on click. */
  explainer: string;
  /** Past-tense receipt shown after a successful run. */
  receipt: string;
}

export function describeAssistAction(
  action: AssistAction,
): AssistActionDescriptor | null {
  switch (action.kind) {
    case "launch_agent": {
      const name = action.agentName ?? "the agent";
      return {
        verb: "Open agent",
        explainer: `Opens ${name} in a floating window with a prepared brief. Nothing runs until you review it and press send.`,
        receipt: `Opened ${name} with the prepared brief — review and send when ready.`,
      };
    }
    case "navigate":
      return {
        verb: action.label ?? "Take me there",
        explainer:
          action.confirm ??
          `Takes you to ${action.href}. Nothing is changed or run.`,
        receipt: action.receipt ?? `Opened ${action.href}.`,
      };
    case "server_action":
      return {
        verb: action.label ?? "Apply",
        explainer:
          action.confirm ??
          "Makes this change on the server. You can undo it afterwards.",
        receipt: "Done — the change has been made.",
      };
    case "surface_write":
      return {
        verb: "Apply to page",
        explainer: `Applies the prepared value to "${action.target}" on this page. You can edit or undo it like any of your own changes.`,
        receipt: `Applied the prepared value to "${action.target}".`,
      };
    default:
      return null;
  }
}
