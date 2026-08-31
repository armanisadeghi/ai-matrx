// features/bindings/words.ts
//
// THE ONE BINDING UI'S VOCABULARY — in one file, because a screen that calls a
// thing by two names is lying about one of them.
//
// The mechanics are shared with the surface bind panel and the shortcut batch
// grid; the WORDS are this domain's. A job binding consumes an OFFERED value,
// never a "surface value", and the word "shortcut" never appears on a mandate
// screen — Arman rejected B1's first ship partly for leaking it.

import type { SourceLabels } from "@/features/surfaces/admin/columns/SurfaceVariableBinding";

/** The four sources, in this domain's words, for either holder type. */
export function sourceLabelsFor(
  holderKind: "agent" | "workflow",
): Required<SourceLabels> {
  return {
    agent_default:
      holderKind === "workflow" ? "Holder Default" : "Agent Default",
    surface_value: "Offered Value",
    direct_value: "Direct Value",
    prompt_user: "Prompt User",
  };
}

/**
 * P17.4 — what fill-down promises and what it cannot promise, said BEFORE the
 * button is pressed. The mandate half of the shortcut grid's own sentence: a
 * literal or a question is the binding's own content and carries everywhere,
 * while an offered value only exists where a value of that name is offered.
 */
export const FILL_DOWN_LIMITS =
  "Direct values, questions and holder defaults fill cleanly. An offered value only lands where that place offers a value of the same name — elsewhere the row re-binds to a value named like the input, or clears and goes red.";
