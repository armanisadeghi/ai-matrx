"use client";

// features/ai-models/TopTierModelBadge.tsx — a small icon (not a pill) that marks a model as
// top-tier (cost rating 6): only approved accounts can run it. Draws nothing for any other model,
// an unknown model, or while the catalog is still reading (a stand-in would be a lie).

import { Gem } from "lucide-react";
import { isTopTierRating } from "@ai-matrx/agents/models";
import { useModelCatalog } from "@ai-matrx/agents/models/react";

export const TOP_TIER_BADGE_TITLE = "Top-tier model: approved accounts only";

export function TopTierModelBadge({ modelId, className }: { modelId: string | null | undefined; className?: string }) {
  const { models } = useModelCatalog("user");
  if (!modelId) return null;
  const model = models.find((m) => m.id === modelId);
  if (!model || !isTopTierRating(model.costRating)) return null;
  return (
    <span
      role="img"
      data-top-tier-badge=""
      title={TOP_TIER_BADGE_TITLE}
      aria-label={TOP_TIER_BADGE_TITLE}
      className={className ?? "inline-flex shrink-0 items-center text-amber-500"}
    >
      <Gem className="h-3.5 w-3.5" aria-hidden />
    </span>
  );
}
