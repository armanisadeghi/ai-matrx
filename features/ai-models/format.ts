import type { AiModel } from "./types";

// ── Curated rating rendering (ai.model_definition.cost_rating / speed_rating) ──
// Ratings are 1-6 smallints; 6 is the "5+" outlier band. These are THE
// canonical renderers — no hardcoded maker/price maps may exist anywhere.

export type PriceTier = "$" | "$$" | "$$$" | "$$$$" | "$$$$$" | "$$$$$+";

const RATING_TO_TIER: Record<number, PriceTier> = {
  1: "$",
  2: "$$",
  3: "$$$",
  4: "$$$$",
  5: "$$$$$",
  6: "$$$$$+", // renders as the "5+" band
};

/** Stored `cost_rating` (1-6 smallint; 6 = the "5+" outlier band) → tier. */
export function costRatingTier(rating: number | null): PriceTier | null {
  if (typeof rating !== "number") return null;
  return RATING_TO_TIER[rating] ?? null;
}

/** Stored `speed_rating` → display label on the 1-5 scale ("5+" for 6). */
export function speedRatingLabel(rating: number | null): string | null {
  if (typeof rating !== "number") return null;
  return rating >= 6 ? "5+" : String(rating);
}

export const AI_MODELS_LOCATION =
  "AI Matrx Admin — AI Models (/administration/ai-models)";

/** Human-readable, multi-line summary of a single AI model row. */
export function aiModelSummary(m: AiModel): string {
  return [
    `Model: ${m.common_name || m.name}`,
    `Provider: ${m.maker ?? "—"}`,
    `Class: ${m.model_class ?? "—"}`,
    `ID: ${m.id}`,
    `Context window: ${m.context_window ?? "—"}`,
    `Max tokens: ${m.max_tokens ?? "—"}`,
    `Flags: ${[
      m.is_primary ? "primary" : null,
      m.is_premium ? "premium" : null,
      m.is_deprecated ? "deprecated" : null,
    ]
      .filter(Boolean)
      .join(", ") || "—"}`,
  ].join("\n");
}
