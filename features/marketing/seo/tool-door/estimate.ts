// features/marketing/seo/tool-door/estimate.ts — the price of a paid tool call,
// read from the tool's own free refusal.
//
// A probe (`max_cost_usd` at a fraction of a cent) that the spend gate refuses
// answers `over_max_cost` with the gate's exact estimate in its sentence:
// "… is estimated at $0.804 (16,080 points), above your max_cost_usd …"
// (aidream `spend_ask.spend_gate`, written by `format_usd_for_model`). That
// estimate already leaves out every part a stored result answers for free, so
// it is the price of THIS call, not a list price. Null when the sentence does
// not carry one: the screen then says "cost unknown", never a guess.

import type { ToolActionOutcome } from "@ai-matrx/chat/action-requests/hooks/useToolAction";

const ESTIMATED_AT = /estimated at \$\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i;

export function estimateFromMessage(message: string | null | undefined): number | null {
  if (!message) return null;
  const match = ESTIMATED_AT.exec(message);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

/** The estimate a refused probe carries; null for every other outcome. */
export function estimateFromOutcome(outcome: ToolActionOutcome<unknown>): number | null {
  if (outcome.status !== "error" || outcome.error.error_type !== "over_max_cost") return null;
  return estimateFromMessage(outcome.error.message);
}
