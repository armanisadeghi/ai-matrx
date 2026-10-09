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

/** Arman's families (2026-10-08): every Claude Mythos, every Claude Fable, GPT-6 Astra, and every claude-*-max model. */
export function belongsInMaxTier(name: string): boolean {
  const n = name.toLowerCase();
  return /mythos|fable|gpt-6-astra/.test(n) || /^claude-.*-max(-|$)/.test(n);
}

function isLive(model: TierModel): boolean {
  return !model.is_deprecated && !model.retired_at;
}

export type TierMismatch = "should-be-max" | "not-in-max-families";

/**
 * Why this model disagrees with the MAX-tier rule, or null when it agrees. Membership is rating 6;
 * (a) a live family model not rated 6 is flagged; (b) a live rating-6 model outside the families is
 * flagged unless its name says "max" (deep-research-max-preview). Retired models are exempt, and a
 * non-Claude "Max" (Flux, Qwen) that is not rated 6 is never flagged.
 */
export function tierMismatch(model: TierModel): TierMismatch | null {
  if (!isLive(model)) return null;
  if (belongsInMaxTier(model.name)) return isMaxTier(model) ? null : "should-be-max";
  if (isMaxTier(model) && !model.name.toLowerCase().includes("max")) return "not-in-max-families";
  return null;
}

export function tierMismatchText(kind: TierMismatch): string {
  return kind === "should-be-max"
    ? "Tier mismatch: Mythos, Fable, GPT-6 Astra and Claude -max models belong in the MAX tier, but this one is not rated 5+."
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

/**
 * The rating a save would write, from whichever editor is driving it: pasted JSON that names
 * cost_rating (null clears it), otherwise the form's select. One helper so the form and the
 * raw-JSON tab cannot disagree about whether a save crosses the MAX tier.
 */
export function intendedCostRating(input: {
  /** Raw JSON text when the Raw JSON tab has unsaved edits, else null. */
  rawJson: string | null;
  formRating: string;
  current: number | null;
}): number | null {
  const text = input.rawJson?.trim();
  if (text && text !== "{}") {
    const raw: unknown = JSON.parse(text);
    if (raw && typeof raw === "object" && "cost_rating" in raw) {
      const rating = (raw as Record<string, unknown>).cost_rating;
      if (rating === null) return null;
      if (typeof rating === "number") return rating;
    }
    return input.current;
  }
  const n = parseInt(input.formRating, 10);
  return input.formRating && Number.isFinite(n) ? n : null;
}

/** The confirm a save owes, or null when it does not cross the line. Used by every cost_rating editor. */
export function tierConfirmFor(input: {
  rawJson: string | null;
  formRating: string;
  current: number | null;
}): { from: number | null; to: number | null } | null {
  const to = intendedCostRating(input);
  return crossesMaxTier(input.current, to) ? { from: input.current, to } : null;
}
