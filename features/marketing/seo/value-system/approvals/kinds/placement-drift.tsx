"use client";

/**
 * KIND — placement drift from an inherited rung (P30a THE DIFF LAW, KI-050).
 *
 * Arman: "If we ever change it at the top level, it needs to be presented to
 * them as a diff that they can opt in or out of." A row means this site has
 * always INHERITED its placement of a keyword (brand / organization / system
 * rung — never its own site-tier ruling) and that rung's opinion has since
 * moved. Both decisions write through `setKeywordService`, the ONE placement
 * write, at the site's own tier:
 *   • Take it   — the NEW offering becomes the site's own ruling.
 *   • Keep mine — the OLD offering becomes the site's own explicit ruling.
 * Either way the site now owns a site-tier row, so the drift leaves the queue
 * for good and no second table remembers the decision.
 *
 * Folded in from `topics/PlacementDiffQueue.tsx` (deleted 2026-09-14).
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import AppLink from "@/components/navigation/AppLink";
import { setKeywordService } from "@/features/marketing/seo/keyword-workbench/data";
import { SCOPE_TIER_LABEL } from "@/features/marketing/seo/keyword-workbench/scope-tiers";
import { topicNodeHref } from "@/features/marketing/seo/value-system/reason-links";
import { getTopicPlacementDiff } from "@/features/marketing/seo/value-system/topics/data";
import type { TopicPlacementDiffRow } from "@/features/marketing/seo/value-system/topics/types";
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
  ["seo-topic-placement-diff", siteId] as const;

interface DriftItem extends ApprovalItem {
  row: TopicPlacementDiffRow;
}

function tierWords(tier: string): string {
  return SCOPE_TIER_LABEL[tier] ?? tier;
}

function toItem(scope: ApprovalScope, row: TopicPlacementDiffRow): DriftItem {
  const ctx = { brandId: scope.brandId, siteId: scope.siteId };
  const from = row.old_topic_name ?? "not placed";
  return {
    key: `${KIND_ID}:${row.keyword_id}`,
    kindId: KIND_ID,
    row,
    headline: `"${row.phrase}" — ${tierWords(row.scope_tier)} moved it from ${from} to ${row.new_topic_name}`,
    acceptEffect: `Places "${row.phrase}" under ${row.new_topic_name} as this site's own ruling.`,
    rejectEffect: row.old_topic_name
      ? `Keeps "${row.phrase}" under ${row.old_topic_name} as this site's own ruling.`
      : `Nothing to keep — this keyword had no earlier offering.`,
    proposedBy: tierWords(row.scope_tier),
    proposedAt: row.changed_at,
    doors: (
      <span className="inline-flex flex-wrap items-center gap-1">
        <KeywordDoor scope={scope} phrase={row.phrase} />
        {row.old_topic_id ? (
          <AppLink
            href={topicNodeHref(ctx, row.old_topic_id)}
            className="text-primary underline-offset-2 hover:underline"
          >
            {row.old_topic_name}
          </AppLink>
        ) : (
          <span>not placed</span>
        )}
        <ArrowRight className="size-3" />
        <AppLink
          href={topicNodeHref(ctx, row.new_topic_id)}
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          {row.new_topic_name}
        </AppLink>
      </span>
    ),
  };
}

function useSource(scope: ApprovalScope): ApprovalSource {
  const query = useQuery({
    queryKey: queryKey(scope.siteId),
    queryFn: ({ signal }) => getTopicPlacementDiff(scope.siteId, PAGE, signal),
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

async function writeEach(
  scope: ApprovalScope,
  items: ApprovalItem[],
  pick: (row: TopicPlacementDiffRow) => string | null,
  reason: string | null,
  fallbackNote: (phrase: string) => string,
): Promise<ApprovalOutcome> {
  const outcome: ApprovalOutcome = { applied: 0, failures: [] };
  // One keyword per write: each row carries its OWN target offering.
  for (const item of items as DriftItem[]) {
    const topicId = pick(item.row);
    if (!topicId) {
      outcome.failures.push({
        key: item.key,
        message: `"${item.row.phrase}" had no earlier offering to keep.`,
      });
      continue;
    }
    try {
      await setKeywordService({
        siteId: scope.siteId,
        keywordIds: [item.row.keyword_id],
        topicId,
        notes: reason ?? fallbackNote(item.row.phrase),
      });
      outcome.applied += 1;
    } catch (error) {
      outcome.failures.push({ key: item.key, message: extractErrorMessage(error) });
    }
  }
  return outcome;
}

function useDecisions(scope: ApprovalScope): ApprovalDecisions {
  const queryClient = useQueryClient();
  const settle = () => {
    void queryClient.invalidateQueries({ queryKey: queryKey(scope.siteId) });
    void queryClient.invalidateQueries({ queryKey: ["seo", "topics"] });
  };
  return {
    acceptItems: async (items, reason) => {
      const result = await writeEach(
        scope,
        items,
        (row) => row.new_topic_id,
        reason,
        (phrase) => `Opted in to the new default for "${phrase}"`,
      );
      settle();
      return result;
    },
    rejectItems: async (items, reason) => {
      const result = await writeEach(
        scope,
        items,
        (row) => row.old_topic_id,
        reason,
        (phrase) => `Kept this site's own placement for "${phrase}"`,
      );
      settle();
      return result;
    },
  };
}

export const placementDriftKind: ApprovalKind = {
  id: KIND_ID,
  label: "Inherited offering moved",
  accept: {
    label: "Take it",
    keepsReason: true,
    reasonPrompt: "Why take the new offering? (optional)",
  },
  reject: {
    label: "Keep mine",
    keepsReason: true,
    reasonPrompt: "Why keep the old offering? (optional)",
  },
  useSource,
  useDecisions,
};
