// The MAX tier (Arman, 2026-10-08): ai.model_definition.cost_rating 6, rendered "5+" ($$$$$+).
// Members by his rule: every Mythos, every Fable, GPT-6 Astra, and every "-max" model.
// The rule only FLAGS drift ("tier mismatch"); it never rewrites data.
import type { AiModel } from "./types";

export const MAX_TIER_RATING = 6;
export const MAX_TIER_LABEL = "MAX";

export type TierView = "max" | "mismatch" | "held";
export const TIER_VIEWS: readonly TierView[] = ["max", "mismatch", "held"];

export const TIER_VIEW_LABELS: Record<TierView, string> = {
  max: "Max tier (5+)",
  mismatch: "Tier mismatch",
  held: "Held",
};

export const TIER_VIEW_TITLES: Record<TierView, string> = {
  max: "Every model rated 5+ (MAX), retired included",
  mismatch: "Models that disagree with the MAX-tier list",
  held: "Rating changes held for your review",
};

export function parseTierView(raw: string | null): TierView | undefined {
  return TIER_VIEWS.find((view) => view === raw);
}

type TierModel = Pick<
  AiModel,
  "name" | "cost_rating" | "is_deprecated" | "retired_at" | "pending_cost_rating"
>;

export function isMaxTier(model: Pick<AiModel, "cost_rating">): boolean {
  return model.cost_rating === MAX_TIER_RATING;
}

/** A model Arman's list says belongs in the MAX tier, by name. */
export function belongsInMaxTier(name: string): boolean {
  const n = name.toLowerCase();
  return /mythos|fable|gpt-6-astra/.test(n) || n.endsWith("-max");
}

function isLive(model: TierModel): boolean {
  return !model.is_deprecated && !model.retired_at;
}

export type TierMismatch = "should-be-max" | "not-in-max-families";

/** Why this model disagrees with the MAX-tier rule, or null when it agrees (retired models are exempt). */
export function tierMismatch(model: TierModel): TierMismatch | null {
  if (!isLive(model)) return null;
  const expected = belongsInMaxTier(model.name);
  if (expected && !isMaxTier(model)) return "should-be-max";
  if (!expected && isMaxTier(model)) return "not-in-max-families";
  return null;
}

export function tierMismatchText(kind: TierMismatch): string {
  return kind === "should-be-max"
    ? "Tier mismatch: Mythos, Fable, GPT-6 Astra and -max models belong in the MAX tier, but this one is not rated 5+."
    : "Tier mismatch: this live model is rated 5+ (MAX) but is not Mythos, Fable, GPT-6 Astra or a -max model.";
}

export function hasHeldTierChange(model: Pick<AiModel, "pending_cost_rating">): boolean {
  return model.pending_cost_rating != null;
}

export function matchesTierView(model: TierModel, view: TierView): boolean {
  if (view === "max") return isMaxTier(model);
  if (view === "mismatch") return tierMismatch(model) !== null;
  return hasHeldTierChange(model);
}

/** Moving a rating into or out of MAX is the gated act. */
export function crossesMaxTier(from: number | null | undefined, to: number | null | undefined): boolean {
  return (from === MAX_TIER_RATING) !== (to === MAX_TIER_RATING);
}
