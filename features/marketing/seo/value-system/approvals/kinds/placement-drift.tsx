"use client";

/**
 * KIND — the AI moved a placement on this site (P30a THE DIFF LAW).
 *
 * Arman: "If we ever change it at the top level, it needs to be presented to
 * them as a diff that they can opt in or out of." On the canonical offering
 * model every placement is the site's own (brand-offerings cutover D4, D10), so
 * the only opinion that can move under a person is the Offering assigner's. A
 * row means the assigner moved one of this site's keywords from one offering to
 * another and nobody on this site has ruled on it
 * (`seo.gsc_offering_placement_drift`, bounded by the site's own AI placements —
 * the inherited-rung read it replaces never finished on a large site, D313).
 *   • Take it   — confirms the new placement as this site's own ruling, with
 *     the reason (`seo.gsc_confirm_keyword_offering`).
 *   • Keep mine — places the keyword back on the earlier offering as this site's
 *     own ruling (`setKeywordOffering`).
 * Either way the site now owns the ruling, so the row leaves the queue for good.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import AppLink from "@/components/navigation/AppLink";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  confirmKeywordOfferings,
  getOfferingPlacementDrift,
  KEYWORD_OFFERINGS_KEY,
  setKeywordOffering,
  type OfferingDriftRow,
} from "@/features/marketing/seo/keyword-workbench/data";
import { SITE_OFFERINGS_KEY } from "@/features/marketing/seo/keyword-workbench/hooks/useSiteOfferings";
import { extractErrorMessage } from "@/utils/errors";
import { KeywordDoor } from "../doors";
import type {
  ApprovalDecisions,
  ApprovalItem,
  ApprovalKind,
  ApprovalOutcome,
  ApprovalScope,
  ApprovalSource,
} from "../types";

const KIND_ID = "placement_drift";
const PAGE = 50;

const queryKey = (siteId: string) =>
  [...SITE_OFFERINGS_KEY, "placement-drift", siteId] as const;

interface DriftItem extends ApprovalItem {
  row: OfferingDriftRow;
}

const NO_ORGANIZATION =
  "This queue does not know which organization owns the site, so nothing can be written from here. Open the site's own queue.";

function toItem(scope: ApprovalScope, row: OfferingDriftRow): DriftItem {
  const offeringsHref = marketingRoutes.site(scope.brandId ?? null, scope.siteId, "/value/offerings");
  const from = row.oldOfferingName ?? "no offering";
  return {
    key: `${KIND_ID}:${row.keywordId}`,
    kindId: KIND_ID,
    row,
    headline: `"${row.phrase}" — the assigner moved it from ${from} to ${row.newOfferingName}`,
    acceptEffect: `Keeps "${row.phrase}" under ${row.newOfferingName} as this site's own ruling.`,
    rejectEffect: row.oldOfferingName
      ? `Puts "${row.phrase}" back under ${row.oldOfferingName} as this site's own ruling.`
      : `Nothing to go back to — this keyword had no earlier offering.`,
    proposedBy: "Offering assigner",
    proposedAt: row.changedAt,
    doors: (
      <span className="inline-flex flex-wrap items-center gap-1">
        <KeywordDoor scope={scope} phrase={row.phrase} />
        {row.oldOfferingName ? (
          <AppLink href={offeringsHref} className="text-primary underline-offset-2 hover:underline">
            {row.oldOfferingName}
          </AppLink>
        ) : (
          <span>no offering</span>
        )}
        <ArrowRight className="size-3" />
        <AppLink
          href={offeringsHref}
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          {row.newOfferingName}
        </AppLink>
      </span>
    ),
  };
}

function useSource(scope: ApprovalScope): ApprovalSource {
  const query = useQuery({
    queryKey: queryKey(scope.siteId),
    queryFn: ({ signal }) => getOfferingPlacementDrift(scope.siteId, PAGE, signal),
    staleTime: 60_000,
  });
  const items = (query.data ?? []).map((row) => toItem(scope, row));
  return {
    items,
    total: items.length,
    loading: query.isLoading,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}

function useDecisions(scope: ApprovalScope): ApprovalDecisions {
  const queryClient = useQueryClient();
  const settle = () => {
    void queryClient.invalidateQueries({ queryKey: SITE_OFFERINGS_KEY });
    void queryClient.invalidateQueries({ queryKey: [...KEYWORD_OFFERINGS_KEY, scope.siteId] });
  };
  return {
    acceptItems: async (items, reason) => {
      const outcome: ApprovalOutcome = { applied: 0, failures: [] };
      if (!scope.organizationId) {
        return { applied: 0, failures: items.map((item) => ({ key: item.key, message: NO_ORGANIZATION })) };
      }
      try {
        await confirmKeywordOfferings({
          organizationId: scope.organizationId,
          siteId: scope.siteId,
          keywordIds: (items as DriftItem[]).map((item) => item.row.keywordId),
          notes: reason,
        });
        outcome.applied = items.length;
      } catch (error) {
        const message = extractErrorMessage(error);
        outcome.failures = items.map((item) => ({ key: item.key, message }));
      }
      settle();
      return outcome;
    },
    rejectItems: async (items, reason) => {
      const outcome: ApprovalOutcome = { applied: 0, failures: [] };
      // One keyword per write: each row goes back to ITS OWN earlier offering.
      for (const item of items as DriftItem[]) {
        if (!scope.organizationId) {
          outcome.failures.push({ key: item.key, message: NO_ORGANIZATION });
          continue;
        }
        if (!item.row.oldOfferingId) {
          outcome.failures.push({
            key: item.key,
            message: `"${item.row.phrase}" had no earlier offering to go back to.`,
          });
          continue;
        }
        try {
          await setKeywordOffering({
            organizationId: scope.organizationId,
            siteId: scope.siteId,
            keywordIds: [item.row.keywordId],
            offeringId: item.row.oldOfferingId,
            notes: reason ?? `Kept this site's own placement for "${item.row.phrase}"`,
          });
          outcome.applied += 1;
        } catch (error) {
          outcome.failures.push({ key: item.key, message: extractErrorMessage(error) });
        }
      }
      settle();
      return outcome;
    },
  };
}

export const placementDriftKind: ApprovalKind = {
  id: KIND_ID,
  label: "The AI moved an offering",
  accept: {
    label: "Take it",
    keepsReason: true,
    reasonPrompt: "Why is the new offering right? (optional)",
  },
  reject: {
    label: "Keep mine",
    keepsReason: true,
    reasonPrompt: "Why keep the earlier offering? (optional)",
  },
  useSource,
  useDecisions,
};
