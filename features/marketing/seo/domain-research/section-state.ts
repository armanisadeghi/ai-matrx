// features/marketing/seo/domain-research/section-state.ts — one tool outcome
// to one screen state. Pure, so every state the page can show is tested
// without a server.
//
// REUSE FIRST. Each section opens with a PROBE: the same call with
// `max_cost_usd` at a fraction of a cent. The tool plans reuse before its spend
// gate, so a fresh stored result comes back free (`cost.reused`), and anything
// that would cost money is refused by the gate with `over_max_cost` before any
// spend or ask — which this file reads as "nothing stored", and the screen then
// offers the paid run at its price. The tool is the only judge of reuse.

import type { ToolActionOutcome } from "@ai-matrx/chat/action-requests/hooks/useToolAction";
import { isToolEnvelope, type ToolEnvelope } from "@ai-matrx/chat/action-requests/screen-run";

/** Above zero (the tool refuses 0) and below any real call. */
export const PROBE_MAX_COST_USD = 0.0001;

export type SectionState<T> =
  | { kind: "idle" }
  | { kind: "loading"; buying: boolean }
  /** No stored result young enough to reuse; a run costs money. `note` says why we are here again. */
  | { kind: "not_stored"; note: string | null }
  | {
      kind: "ready";
      data: T;
      /** The tool's reuse verdict: a stored result was returned free. */
      reused: boolean;
      /** When the returned data was collected (the evidence run's date). */
      observedAt: string | null;
      chargedUsd: number | null;
      /** Some figures failed; `notice` says which. */
      partial: boolean;
      notice: string | null;
    }
  | { kind: "error"; message: string };

export function sectionFromOutcome<T>(
  outcome: ToolActionOutcome<ToolEnvelope<T>>,
  { probe }: { probe: boolean },
): SectionState<T> {
  switch (outcome.status) {
    case "declined":
      return { kind: "not_stored", note: "Declined. Nothing was spent." };
    case "dismissed":
      return { kind: "not_stored", note: "Closed. Nothing was spent." };
    case "busy":
      return { kind: "error", message: outcome.message };
    case "error":
      if (probe && outcome.error.error_type === "over_max_cost") {
        return { kind: "not_stored", note: null };
      }
      return { kind: "error", message: outcome.error.message };
    case "ok": {
      const envelope = outcome.output;
      if (!isToolEnvelope<T>(envelope)) {
        return { kind: "error", message: "The tool answered in a shape this page cannot read." };
      }
      if ((envelope.status === "ok" || envelope.status === "partial") && envelope.data) {
        const evidence = envelope.evidence?.find((e) => e.observed_at) ?? null;
        const asOf = (envelope.data as { as_of?: unknown }).as_of;
        return {
          kind: "ready",
          data: envelope.data,
          reused: envelope.cost?.reused === true,
          observedAt: evidence?.observed_at ?? (typeof asOf === "string" ? asOf : null),
          chargedUsd: envelope.cost?.charged_usd ?? null,
          partial: envelope.status === "partial",
          notice: envelope.status === "partial" ? (envelope.notices?.[0] ?? null) : null,
        };
      }
      return {
        kind: "error",
        message:
          envelope.notices?.[0] ??
          `The tool answered "${envelope.status}" with no data.`,
      };
    }
  }
}
