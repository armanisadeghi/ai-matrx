// Curated rating renderers (cost/speed words, tiers) moved to `@ai-matrx/agents/models`
// (agent core A1) — re-exported so the admin tables keep one import. The two admin-only
// helpers below stay here: they name an admin location and summarize an admin row.
export {
  costRatingTier,
  costRatingWord,
  priceTierRating,
  speedRatingLabel,
  speedRatingWord,
  type PriceTier,
} from "@ai-matrx/agents/models";
import type { AiModel } from "./types";

export const AI_MODELS_LOCATION =
  "AI Matrx Admin — AI Models (/administration/ai/ai-models)";

/** Human-readable, multi-line summary of a single AI model row. */
export function aiModelSummary(m: AiModel): string {
  return [
    `Model: ${m.common_name || m.name}`,
    `Provider: ${m.maker ?? "—"}`,
    `ID: ${m.id}`,
    `Context window: ${m.context_window ?? "—"}`,
    `Max tokens: ${m.max_tokens ?? "—"}`,
    `Flags: ${
      [
        m.is_primary ? "primary" : null,
        m.is_premium ? "premium" : null,
        m.is_deprecated ? "deprecated" : null,
      ]
        .filter(Boolean)
        .join(", ") || "—"
    }`,
  ].join("\n");
}
