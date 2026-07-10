// features/ai-models/lab/modelDisplay.ts
//
// Display helpers for the model picker.
//
// 2026-07-10 ai-schema reshape: the DB now stores the model's true `maker`
// (ai.model_public.maker) and curated `cost_rating` / `speed_rating` (1-6
// smallints), so the old derivation hacks are gone:
//   - resolveMaker(providerName, modelClass) — deleted; read `maker` directly.
//   - priceTier(outputCost) threshold bands  — deleted; render the stored
//     cost_rating via costRatingTier() below.
// This file's full deletion (folding the tier renderer into the picker) is a
// later phase.

export type PriceTier = "$" | "$$" | "$$$" | "$$$$" | "$$$$$" | "$$$$$+";

const RATING_TO_TIER: Record<number, PriceTier> = {
  1: "$",
  2: "$$",
  3: "$$$",
  4: "$$$$",
  5: "$$$$$",
  6: "$$$$$+", // 6 renders as the "5+" band
};

/** Stored `cost_rating` (1-6 smallint; 6 = the "5+" outlier band) → tier. */
export function costRatingTier(rating: number | null): PriceTier | null {
  if (typeof rating !== "number") return null;
  return RATING_TO_TIER[rating] ?? null;
}
