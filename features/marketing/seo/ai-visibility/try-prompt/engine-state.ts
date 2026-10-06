// features/marketing/seo/ai-visibility/try-prompt/engine-state.ts — one
// engine's row in "Try one prompt", from one `seo_ai_visibility try_prompt`
// outcome. Pure, so every state the row can show is tested without a server.
//
// Each engine is probed ALONE (`models: [engine]`, `max_cost_usd` at a fraction
// of a cent): a stored answer inside the reuse window comes back free with its
// text; otherwise the spend gate refuses before any spend and names this
// engine's exact price. So the person sees, per engine, "stored — free" or its
// price before anything is asked.

import type { ToolActionOutcome } from "@ai-matrx/chat/action-requests/hooks/useToolAction";
import { isToolEnvelope, type ToolEnvelope } from "@ai-matrx/chat/action-requests/screen-run";
import { estimateFromOutcome } from "../../tool-door/estimate";
import type { AnswerEngine, TryPromptData, TryPromptResult } from "../brand-lookup/types";

export const ANSWER_ENGINES: readonly AnswerEngine[] = ["chat_gpt", "claude", "gemini", "perplexity"];

export type EngineState =
  | { kind: "checking" }
  /** Nothing stored; asking costs `estimateUsd` (null: the gate named no price). */
  | { kind: "priced"; estimateUsd: number | null }
  | { kind: "asking" }
  | { kind: "answered"; result: TryPromptResult; reused: boolean }
  | { kind: "error"; message: string };

/** Every engine's row from one outcome. `probe` marks the free price check. */
export function engineStatesFromOutcome(
  outcome: ToolActionOutcome<ToolEnvelope<TryPromptData>>,
  engines: readonly AnswerEngine[],
  { probe }: { probe: boolean },
): Partial<Record<AnswerEngine, EngineState>> {
  const all = (state: EngineState) =>
    Object.fromEntries(engines.map((e) => [e, state])) as Partial<Record<AnswerEngine, EngineState>>;
  switch (outcome.status) {
    case "declined":
    case "dismissed":
      // Nothing was spent; the rows go back to their price (re-probed by the caller).
      return {};
    case "busy":
      return all({ kind: "error", message: outcome.message });
    case "error":
      if (probe && outcome.error.error_type === "over_max_cost") {
        return all({ kind: "priced", estimateUsd: estimateFromOutcome(outcome) });
      }
      return all({ kind: "error", message: outcome.error.message });
    case "ok": {
      const envelope = outcome.output;
      if (!isToolEnvelope<TryPromptData>(envelope) || !envelope.data) {
        const said = isToolEnvelope(envelope) ? envelope.notices?.[0] : null;
        return all({ kind: "error", message: said ?? "The tool answered in a shape this page cannot read." });
      }
      const out: Partial<Record<AnswerEngine, EngineState>> = {};
      for (const engine of engines) {
        const result = envelope.data.results.find((r) => r.model === engine);
        out[engine] = !result
          ? { kind: "error", message: "The tool returned no answer for this engine." }
          : result.error || result.answer == null
            ? { kind: "error", message: result.error ?? "No answer." }
            : { kind: "answered", result, reused: result.reused === true };
      }
      return out;
    }
  }
}

/** The engines a click would pay for, and their summed price (null if any price is unknown). */
export function toAsk(
  selected: readonly AnswerEngine[],
  states: Partial<Record<AnswerEngine, EngineState>>,
): { engines: AnswerEngine[]; totalUsd: number | null } {
  const engines = selected.filter((e) => states[e]?.kind === "priced");
  let total: number | null = 0;
  for (const e of engines) {
    const s = states[e];
    const usd = s?.kind === "priced" ? s.estimateUsd : null;
    total = total == null || usd == null ? null : total + usd;
  }
  return { engines, totalUsd: engines.length ? total : 0 };
}
