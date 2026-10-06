/** `run_mandate` — the executable, one-click AI Assist action. */

import type {
  AssistActionDefinition,
  AssistActionResult,
} from "../assist-action-types";

export const runMandateAssistAction: AssistActionDefinition = {
  label: "Run job",
  kind: "run_mandate",
  description:
    "Run a governed mandate immediately and show canonical progress in a minimized LiveRunWindow.",
  handler: async (assist, ctx): Promise<AssistActionResult> => {
    if (assist.action.kind !== "run_mandate") {
      return { ok: false, error: "run_mandate: wrong action payload" };
    }
    return ctx.runMandate({
      assistId: assist.id,
      mandateKey: assist.action.mandateKey,
      sourceFeature: assist.action.sourceFeature,
      variables: assist.action.variables,
      workingMessage: assist.action.workingMessage,
      completeMessage: assist.action.completeMessage,
    });
  },
};
