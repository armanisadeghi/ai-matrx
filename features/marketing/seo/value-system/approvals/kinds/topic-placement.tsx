"use client";

/**
 * KIND — a placement the Offering assigner was not sure about (P12, KI-014).
 *
 * The assigner places every keyword it can; one below the `confidence_floor`
 * knob (or every one, while its autonomy mode waits for a person) is written
 * with `metadata.placement.confirmed = false` and waits here.
 *   • Confirm — `seo.gsc_confirm_keyword_topic`, the same write the proposals
 *     table's Confirm uses. It records no reason: the row it confirms is the
 *     shared system-tier placement, which has no tenant-safe place for one
 *     site's words (FOUND_DEFECTS — tier-blind placement readers).
 *   • Place elsewhere — `setKeywordService` (the ONE placement write) at this
 *     site's own tier, with the person's reason. The keyword leaves the
 *     assigner's list for good.
 *
 * The queue shows the highest-demand page; the full, sortable, filterable set
 * stays the canonical keyword table on the offerings screen (P26 — ONE TABLE),
 * reached by this kind's "more" door.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AppLink from "@/components/navigation/AppLink";
import { setKeywordService } from "@/features/marketing/seo/keyword-workbench/data";
import { topicNodeHref } from "@/features/marketing/seo/value-system/reason-links";
import {
  confirmKeywordTopics,
  listAllTopics,
  listTopicProposals,
} from "@/features/marketing/seo/value-system/topics/data";
import { buildTopicTree } from "@/features/marketing/seo/value-system/topics/lib";
import { TopicPickerDialog } from "@/features/marketing/seo/value-system/topics/TopicPickerDialog";
import type { TopicProposalRow } from "@/features/marketing/seo/value-system/topics/types";
import { extractErrorMessage } from "@/utils/errors";
import { KeywordDoor } from "../doors";
import type {
  ApprovalChooserProps,
  ApprovalDecisions,
  ApprovalItem,
  ApprovalKind,
  ApprovalScope,
  ApprovalSource,
} from "../types";

const KIND_ID = "topic_placement";
const PAGE = 25;
/** The placement queue's demand window (knob `seo.topic_placement.demand_window_days`). */
const WINDOW_DAYS = 90;

const queryKey = (siteId: string) =>
  ["seo", "topics", "proposals", siteId] as const;

interface PlacementItem extends ApprovalItem {
  row: TopicProposalRow;
}

function window90(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function toItem(scope: ApprovalScope, row: TopicProposalRow): PlacementItem {
  const ctx = { brandId: scope.brandId, siteId: scope.siteId };
  const sure = row.confidence == null ? "no confidence given" : `${row.confidence}% sure`;
  return {
    key: `${KIND_ID}:${row.keyword_id}`,
    kindId: KIND_ID,
    row,
    headline: `Place "${row.phrase}" under ${row.topic_name}`,
    acceptEffect: `Confirms "${row.phrase}" under ${row.topic_name}; the assigner will not revisit it.`,
    rejectEffect: `Places "${row.phrase}" under the offering you choose, as this site's own ruling.`,
    proposedBy: `Offering assigner · ${sure}`,
    doors: (
      <span className="inline-flex flex-wrap items-center gap-1">
        <KeywordDoor scope={scope} phrase={row.phrase} />
        <span>→</span>
        <AppLink
          href={topicNodeHref(ctx, row.topic_id)}
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          {row.topic_name}
        </AppLink>
        <span className="tabular-nums">
          · {row.clicks.toLocaleString()} clicks · {row.impressions.toLocaleString()} impressions
        </span>
      </span>
    ),
  };
}

function useSource(scope: ApprovalScope): ApprovalSource {
  const query = useQuery({
    queryKey: queryKey(scope.siteId),
    queryFn: ({ signal }) => {
      const { start, end } = window90();
      return listTopicProposals(scope.siteId, start, end, PAGE, signal);
    },
    staleTime: 60_000,
  });
  const rows = query.data ?? [];
  const total = rows[0]?.total_count ?? 0;
  return {
    items: rows.map((row) => toItem(scope, row)),
    total,
    loading: query.isLoading,
    error: query.error,
    refetch: () => void query.refetch(),
    moreHref: topicNodeHref({ brandId: scope.brandId, siteId: scope.siteId }, null),
    moreLabel: `Work all ${total.toLocaleString()} in the proposals table`,
  };
}

function useDecisions(scope: ApprovalScope): ApprovalDecisions {
  const queryClient = useQueryClient();
  const settle = () => {
    // The tree, its counts and this kind's own list all live under this root.
    void queryClient.invalidateQueries({ queryKey: ["seo", "topics"] });
  };
  return {
    acceptItems: async (items) => {
      const ids = (items as PlacementItem[]).map((item) => item.row.keyword_id);
      try {
        await confirmKeywordTopics(scope.siteId, ids);
        settle();
        return { applied: items.length, failures: [] };
      } catch (error) {
        const message = extractErrorMessage(error);
        return {
          applied: 0,
          failures: items.map((item) => ({ key: item.key, message })),
        };
      }
    },
    rejectItems: async (items, reason, choice) => {
      if (!choice) {
        return {
          applied: 0,
          failures: items.map((item) => ({
            key: item.key,
            message: "Choose the offering these keywords belong under.",
          })),
        };
      }
      const ids = (items as PlacementItem[]).map((item) => item.row.keyword_id);
      try {
        await setKeywordService({
          siteId: scope.siteId,
          keywordIds: ids,
          topicId: choice,
          notes: reason,
        });
        settle();
        return { applied: items.length, failures: [] };
      } catch (error) {
        const message = extractErrorMessage(error);
        return {
          applied: 0,
          failures: items.map((item) => ({ key: item.key, message })),
        };
      }
    },
  };
}

/** "Not this one — which offering, then?" The canonical offering picker. */
function RejectChooser({ items, onChosen, onCancel }: ApprovalChooserProps) {
  const topics = useQuery({
    queryKey: ["seo", "topics", "catalog"],
    queryFn: () => listAllTopics(),
  });
  const [busy, setBusy] = useState(false);
  if (!topics.data) return null;
  const tree = buildTopicTree(topics.data, [], new Map());
  const placement = items as PlacementItem[];
  const label =
    placement.length === 1
      ? `"${placement[0]?.row.phrase}"`
      : `${placement.length} keywords`;
  return (
    <TopicPickerDialog
      tree={tree}
      busy={busy}
      onCancel={onCancel}
      request={{
        mode: "keyword",
        title: `Place ${label} somewhere else`,
        description:
          "The assigner's offering was wrong. Choose the right one; it becomes this site's own ruling.",
        subject: label,
        currentTopicId: placement.length === 1 ? (placement[0]?.row.topic_id ?? null) : null,
        forbidden: new Set<string>(),
        clearLabel: null,
        reasonPrompt: "Why does it belong there instead?",
        onChoose: (topicId, reason) => {
          if (!topicId) return;
          setBusy(true);
          onChosen(topicId, reason);
        },
      }}
    />
  );
}

export const topicPlacementKind: ApprovalKind = {
  id: KIND_ID,
  label: "Offering placement",
  accept: { label: "Confirm", keepsReason: false },
  reject: { label: "Place elsewhere", keepsReason: true },
  useSource,
  useDecisions,
  RejectChooser,
};
