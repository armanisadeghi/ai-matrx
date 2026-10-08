"use client";

import { Badge } from "@/components/ui/badge";
import { costRatingTier } from "../format";
import {
  MAX_TIER_LABEL,
  hasHeldTierChange,
  isMaxTier,
  tierMismatch,
  tierMismatchText,
} from "../maxTier";
import type { AiModel } from "../types";

type TierModel = Pick<
  AiModel,
  "name" | "cost_rating" | "is_deprecated" | "retired_at" | "pending_cost_rating"
>;

export function MaxTierBadge() {
  return (
    <Badge
      variant="outline"
      className="h-4 border-rose-400 bg-rose-50 px-1 text-[10px] font-semibold text-rose-700 dark:bg-rose-900/20 dark:text-rose-300"
    >
      {MAX_TIER_LABEL}
    </Badge>
  );
}

/** Cost rating, MAX badge, and the two honest flags (tier mismatch, held change). */
export function CostRatingCell({ model }: { model: TierModel }) {
  const mismatch = tierMismatch(model);
  const rating = model.cost_rating ?? null;
  return (
    <span className="flex items-center gap-1 whitespace-nowrap text-xs">
      <span
        className="tabular-nums"
        title={rating === null ? "No cost rating" : `Cost rating ${rating}`}
      >
        {costRatingTier(rating) ?? "—"}
      </span>
      {isMaxTier(model) && <MaxTierBadge />}
      {mismatch && (
        <Badge
          variant="outline"
          title={tierMismatchText(mismatch)}
          className="h-4 border-amber-400 bg-amber-50 px-1 text-[10px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
        >
          Tier mismatch
        </Badge>
      )}
      {hasHeldTierChange(model) && (
        <Badge
          variant="outline"
          title="An automated writer asked to move this model into or out of the MAX tier. It is held for your review."
          className="h-4 border-sky-400 bg-sky-50 px-1 text-[10px] text-sky-700 dark:bg-sky-900/20 dark:text-sky-300"
        >
          Held
        </Badge>
      )}
    </span>
  );
}
