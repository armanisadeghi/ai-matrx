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

import { useEffect } from "react";
import AppLink from "@/components/navigation/AppLink";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import {
  fetchMyAssists,
  selectAssistsForSurface,
  selectAssistsLoaded,
} from "@/features/assists/redux/assistsSlice";
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
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import type { RootState } from "@/lib/redux/store";
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
      <AssistStrip
        surfaceName={KEYWORD_MEANING_SURFACE}
        filter={(candidate: Assist) => candidate.id === assist.id}
      />
    ) : undefined,
  };
}

function useSource(scope: ApprovalScope): ApprovalSource {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const loaded = useAppSelector(selectAssistsLoaded);
  const surfaceAssists = useAppSelector((state: RootState) =>
    selectAssistsForSurface(state, KEYWORD_MEANING_SURFACE),
  );

  // Hydrate the shared slice here: the queue renders nothing while empty, so
  // waiting for a chip strip to load it would mean it never loads.
  useEffect(() => {
    if (userId && !loaded) void dispatch(fetchMyAssists({ userId }));
  }, [dispatch, userId, loaded]);

  const items = surfaceAssists
    .filter(
      (assist) =>
        assist.action.kind === "apply_keyword_meaning" &&
        assist.action.siteId === scope.siteId,
    )
    .flatMap((assist) => {
      const item = toItem(scope, assist);
      return item ? [item] : [];
    });

  return {
    items,
    total: items.length,
    loading: !loaded,
    error: null,
    refetch: () => {
      if (userId) void dispatch(fetchMyAssists({ userId }));
    },
  };
}

function useDecisions(): ApprovalDecisions {
  const { acceptAssist, dismissAssist } = useAssistRunner();
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
      return outcome;
    },
    rejectItems: async (items, reason) => {
      const outcome: ApprovalOutcome = { applied: 0, failures: [] };
      for (const item of items as MeaningItem[]) {
        await dismissAssist(item.assist, reason ?? undefined);
        outcome.applied += 1;
      }
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
