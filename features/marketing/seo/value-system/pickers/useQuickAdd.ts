"use client";

/**
 * P23 — the shared "+ Add" behaviour every dimension-value picker uses.
 *
 * ONE write path (`quickAddValue` → `seo.gsc_quick_add_value`), ONE toast, and
 * ONE answer to the P11 refusal. Keeping it here is the point: the reason the
 * platform kept growing dead-end dropdowns is that each screen re-decided what
 * "+ Add" meant, and most of them decided "nothing".
 *
 * NO DEAD ENDS. Every success toast says what was created AND where it now
 * lives, with a door to the editor that owns it. Every refusal says why in the
 * DB's own words and offers the way forward instead of "no".
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { useMarketingSiteOptional } from "@/features/marketing/components/site/MarketingSiteContext";
import { quickAddValue, QuickAddRefusal, type QuickAddValueResult } from "../data";

export interface QuickAddInput {
  /** The dimension they picked, or null when they are naming a new one. */
  dimensionId?: string | null;
  newDimensionLabel?: string | null;
  nature?: "intrinsic" | "situational";
}

export function useQuickAdd(siteId: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const site = useMarketingSiteOptional();
  const dimensionsHref = marketingRoutes.site(
    site?.brandId ?? null,
    siteId,
    "/value/dimensions",
  );

  const run = useCallback(
    async (
      typed: string,
      input: QuickAddInput = {},
    ): Promise<QuickAddValueResult | null> => {
      const label = typed.trim();
      if (!label) return null;
      try {
        const result = await quickAddValue({
          siteId,
          valueLabel: label,
          dimensionId: input.dimensionId ?? null,
          newDimensionLabel: input.newDimensionLabel ?? null,
          nature: input.nature,
        });
        // Every cache that renders a dimension or its values, in one sweep —
        // the registry is read by five surfaces and a stale one reads as "it
        // didn't work".
        void queryClient.invalidateQueries({
          queryKey: ["marketing", "seo", "facet-dimensions"],
        });
        void queryClient.invalidateQueries({
          queryKey: ["marketing", "value"],
        });
        void queryClient.invalidateQueries({
          queryKey: ["marketing", "gsc", "filter-dimension-catalog", siteId],
        });
        toast.success(
          result.created_dimension
            ? `“${result.value_label}” added — and “${result.dimension_label}” is now one of your dimensions`
            : result.created_value
              ? `“${result.value_label}” added to ${result.dimension_label}`
              : `“${result.value_label}” already existed in ${result.dimension_label} — selected it`,
          {
            description: "It lives in your dimensions, where you can describe it, reorder it or rename it.",
            action: {
              label: "Open dimensions",
              onClick: () => router.push(dimensionsHref),
            },
          },
        );
        return result;
      } catch (error) {
        if (error instanceof QuickAddRefusal && error.isPlatformVocabulary) {
          // P11 — shared vocabulary. Never a bare refusal: the door out is a
          // dimension of their own, and the editor is one click away.
          toast.error(error.message, {
            description:
              "Create your own dimension for this and its choices are yours to set.",
            action: {
              label: "Make my own dimension",
              onClick: () => router.push(dimensionsHref),
            },
          });
          return null;
        }
        toast.error("Couldn't add that", {
          description: extractErrorMessage(error),
        });
        return null;
      }
    },
    [siteId, queryClient, dimensionsHref, router],
  );

  return { quickAdd: run, dimensionsHref };
}
