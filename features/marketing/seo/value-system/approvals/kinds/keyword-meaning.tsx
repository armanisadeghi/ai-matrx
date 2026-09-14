"use client";

/**
 * KIND — an agent's proposal about what a keyword MEANS (C9 / P12).
 *
 * Matchers, worths, stamps and guidelines edits — from the meaning agent's
 * `keyword_meaning_suggest` tool, the matcher engine and situational refresh
 * in a waiting autonomy mode (`seo.fn_autonomy_propose_stamp`), the ruling
 * session's blind check, and the business-discovery guidelines draft. Every
 * one of them is a `platform.assists` row addressed to
 * `matrx-user/keyword-meaning-review`; approval replays the ordinary human
 * write through the canonical assists runner (`suggestions/apply.ts`).
 *
 * A NEW PRODUCER that proposes one of these four payloads needs no code here:
 * write the row through `seo.keyword_meaning_suggest` and it is in the queue.
 *
 * Folded in from `suggestions/KeywordMeaningSuggestions.tsx` (deleted
 * 2026-09-14) — its chip row, per-item approve/reject, select-all, batch
 * confirm and reject-with-reason all live in `ApprovalQueue` now.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import AppLink from "@/components/navigation/AppLink";
import { AssistCard } from "@/features/assists/components/AssistCard";
import { queryAssists } from "@/features/assists/service";
import { getAssistActionTextEditor } from "@/features/assists/runtime/action-editing";
import { useAssistRunner } from "@/features/assists/runtime/useAssistRunner";
import type { Assist } from "@/features/assists/types";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { dimensionValueHref } from "@/features/marketing/seo/value-system/reason-links";
import {
  PROPOSAL_KIND_LABEL,
  describeKeywordMeaningProposal,
  type KeywordMeaningProposal,
} from "@/features/marketing/seo/value-system/suggestions/proposal";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { KeywordDoor } from "../doors";
import type {
  ApprovalDecisions,
  ApprovalItem,
  ApprovalKind,
  ApprovalOutcome,
  ApprovalScope,
  ApprovalSource,
} from "../types";

/**
 * The surface every keyword-meaning suggestion is addressed to. Written by
 * `seo.keyword_meaning_suggest`; changing it here means changing it there.
 */
export const KEYWORD_MEANING_SURFACE = "matrx-user/keyword-meaning-review";

const KIND_ID = "keyword_meaning";
/** How many stamped keywords a row names as doors before summarising the rest. */
const STAMP_DOORS_SHOWN = 3;

interface MeaningItem extends ApprovalItem {
  assist: Assist;
}

function ProposalDoors({
  scope,
  proposal,
}: {
  scope: ApprovalScope;
  proposal: KeywordMeaningProposal;
}) {
  const ctx = { brandId: scope.brandId, siteId: scope.siteId };
  if (proposal.proposal === "guideline_edit") {
    return (
      <AppLink
        href={marketingRoutes.site(scope.brandId, scope.siteId, "/value/guidelines")}
        className="text-primary underline-offset-2 hover:underline"
      >
        Business guidelines
      </AppLink>
    );
  }
  if (proposal.proposal === "offering") {
    return (
      <AppLink
        href={marketingRoutes.site(scope.brandId, scope.siteId, "/value/offerings")}
        className="text-primary underline-offset-2 hover:underline"
      >
        Offerings
      </AppLink>
    );
  }
  const valueDoor = (
    <AppLink
      href={dimensionValueHref(ctx, proposal.dimensionSlug, proposal.valueId)}
      className="text-primary underline-offset-2 hover:underline"
    >
      {proposal.dimensionLabel} → {proposal.valueLabel}
    </AppLink>
  );
  if (proposal.proposal !== "stamp") return valueDoor;
  const shown = proposal.keywordPhrases.slice(0, STAMP_DOORS_SHOWN);
  const rest = proposal.keywordIds.length - shown.length;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {valueDoor}
      <span>on</span>
      {shown.map((phrase) => (
        <KeywordDoor key={phrase} scope={scope} phrase={phrase} />
      ))}
      {rest > 0 ? <span>and {rest.toLocaleString()} more</span> : null}
    </span>
  );
}

/**
 * A proposal that must be read (and may be edited) on its own renders THE
 * canonical assist card for exactly that row — never a chip strip, whose
 * throttled read may not include it and would leave the row with no way to
 * decide. Closing the card (after approve, reject or edit) refreshes the queue.
 */
function MeaningCardReview({ assist }: { assist: Assist }) {
  const queryClient = useQueryClient();
  const userId = useAppSelector(selectUserId);
  return (
    <div className="rounded-md border border-border bg-background">
      <AssistCard
        assist={assist}
        onClose={() =>
          void queryClient.invalidateQueries({
            queryKey: meaningQueryKey(userId),
          })
        }
      />
    </div>
  );
}

function toItem(scope: ApprovalScope, assist: Assist): MeaningItem | null {
  if (assist.action.kind !== "apply_keyword_meaning") return null;
  const { proposal, provenance } = assist.action;
  const described = describeKeywordMeaningProposal(proposal);
  const editable = getAssistActionTextEditor(assist.action) !== null;
  return {
    key: `${KIND_ID}:${assist.id}`,
    kindId: KIND_ID,
    subKind: proposal.proposal,
    assist,
    headline: described.headline,
    acceptEffect: described.writePath,
    rejectEffect:
      "Rejects the suggestion with your reason; this exact suggestion is never proposed again.",
    proposedBy: provenance.agentName ?? null,
    proposedAt: assist.createdAt,
    badge: PROPOSAL_KIND_LABEL[proposal.proposal],
    doors: <ProposalDoors scope={scope} proposal={proposal} />,
    // A full document is read (and may be edited) in its own card before it
    // is approved — never a blind batch approve.
    // KI-040 step 6: an Offering's approval is the brand-offering writer,
    // which has not landed. The row says so and keeps Reject — never a dead
    // or disabled-looking Approve (`suggestions/apply.ts` refuses too).
    individualReview:
      proposal.proposal === "offering" ? (
        <p className="text-xs text-muted-foreground">
          Approving adds this offering to your brand and sets its worth — that
          lands with the brand-offering model, so it waits here for now. If it
          is wrong for this business, reject it and it will not be proposed
          again.
        </p>
      ) : editable ? (
        <MeaningCardReview assist={assist} />
      ) : undefined,
  };
}

/**
 * The queue's read is the COMPLETE pending set addressed to the reader — the
 * manager read (`queryAssists`), never the chip read. The chip read
 * (`list_my_presentable_assists`) is throttled by the presentation policy and
 * capped at 50: measured 2026-09-14 it returned 0 of admin@admin.com's 214
 * pending rows, so a queue built on it silently hid work.
 */
const MEANING_PAGE = 1000;

const meaningQueryKey = (userId: string | null) =>
  ["assists", "keyword-meaning-queue", userId] as const;

function useSource(scope: ApprovalScope): ApprovalSource {
  const userId = useAppSelector(selectUserId);
  const query = useQuery({
    queryKey: meaningQueryKey(userId),
    enabled: Boolean(userId),
    staleTime: 30_000,
    queryFn: () =>
      queryAssists(userId as string, {
        statuses: ["pending"],
        sourceKey: null,
        sourceKind: null,
        surfaceName: KEYWORD_MEANING_SURFACE,
        search: "",
        maxConfidence: null,
        minConfidence: null,
        minPriority: null,
        maxPriority: null,
        includeSnoozed: false,
        starredOnly: false,
        unseenOnly: false,
        sortField: "created_at",
        sortAscending: false,
        page: 1,
        pageSize: MEANING_PAGE,
      }),
  });

  const items = (query.data?.rows ?? [])
    .filter(
      (assist) =>
        assist.action.kind === "apply_keyword_meaning" &&
        assist.action.siteId === scope.siteId,
    )
    .flatMap((assist) => {
      const item = toItem(scope, assist);
      return item ? [item] : [];
    });

  if ((query.data?.total ?? 0) > MEANING_PAGE) {
    // Honest about the page: a reader with more than a thousand pending
    // meaning proposals sees the newest thousand, and this says so.
    console.warn(
      `[approvals] keyword-meaning queue holds ${query.data?.total} pending rows; showing the newest ${MEANING_PAGE}.`,
    );
  }

  return {
    items,
    total: items.length,
    loading: query.isLoading || !userId,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}

function useDecisions(): ApprovalDecisions {
  const { acceptAssist, dismissAssist } = useAssistRunner();
  const queryClient = useQueryClient();
  const userId = useAppSelector(selectUserId);
  const settle = () =>
    void queryClient.invalidateQueries({ queryKey: meaningQueryKey(userId) });
  return {
    acceptItems: async (items, reason) => {
      const outcome: ApprovalOutcome = { applied: 0, failures: [] };
      // Sequential on purpose: each approval is a real domain write, and two
      // racing on the same value would make the receipt order a lie.
      for (const item of items as MeaningItem[]) {
        const result = await acceptAssist(item.assist, reason ?? undefined);
        if (result.ok) outcome.applied += 1;
        else outcome.failures.push({ key: item.key, message: result.error });
      }
      settle();
      return outcome;
    },
    rejectItems: async (items, reason) => {
      const outcome: ApprovalOutcome = { applied: 0, failures: [] };
      for (const item of items as MeaningItem[]) {
        await dismissAssist(item.assist, reason ?? undefined);
        outcome.applied += 1;
      }
      settle();
      return outcome;
    },
  };
}

export const keywordMeaningKind: ApprovalKind = {
  id: KIND_ID,
  label: "Keyword meaning",
  accept: {
    label: "Approve",
    keepsReason: true,
    reasonPrompt: "Why is this right for your business? (optional)",
  },
  reject: {
    label: "Reject",
    keepsReason: true,
    // A rejection kills this suggestion for good; the reason is what stops
    // the agents spending on it again, so it is never optional.
    reasonRequired: true,
    reasonPrompt: "Why this is wrong for your business…",
  },
  useSource,
  useDecisions,
};
