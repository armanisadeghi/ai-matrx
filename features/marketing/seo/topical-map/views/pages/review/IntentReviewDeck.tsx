"use client";

// features/marketing/seo/topical-map/views/pages/review/IntentReviewDeck.tsx
//
// THE PROPOSED DESTINATIONS, ONE REVIEW GRAMMAR. `ReviewDeck`
// (`components/official/review-deck/ReviewDeck.tsx`, CONTRACTS §4.2) is the
// platform's accept/reject affordance; this file is the adapter that turns the
// `proposed` rows of `seo.list_page_intents` into its items and turns an accept
// into `seo.set_page_intents`.
//
// ACCEPTING IS NOT A NEW DECISION — it re-sends the row's OWN intent with
// `state: "accepted"` and `source: "human"`. That is the whole meaning of the
// screen: the agent proposed, the person signed it. Nothing about where the
// page is going changes, which is why the consequence sentence says so.
//
// 🚨 REJECT IS AN HONEST CONTROL, NOT A WORKING ONE. Withdrawing a proposal is
// `seo.withdraw_page_intents(p_site_id, p_page_ids, p_source)` (aidream
// migrations 0797/0799) and it has NO wrapper in this repo's `data.ts` /
// `hooks.ts` — both coordinator-owned (CONTRACTS §9), so this lane files the
// gap rather than growing a second read path beside them. The control says
// exactly that, in one sentence, in the place the person clicks. It is not
// hidden, not greyed out, and not quietly wired to something that does
// something else.

import { useState } from "react";

import {
  ReviewDeck,
  type ReviewItem,
  type ReviewMode,
} from "@/components/official/review-deck/ReviewDeck";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";

import { useSetPageIntents } from "../../../hooks";
import type { PageIntentItem, SetPageIntentsItem } from "../../../types";
import { pageTopicState, pageTopicViewOf, selectMapReview } from "../../../redux/selectors";
import { setReviewCursor } from "../../../redux/slice";
import { IntentDot } from "../../../ui/IntentDot";
import type { IntentReviewDeckProps, SetPageIntentsOutcome } from "../seams";
import {
  mergeSetPageIntentsOutcomes,
  setPageIntentsOutcomeLine,
  toSetPageIntentsOutcome,
} from "../bulk/setPageIntentsOutcome";

/** The sentence the missing wrapper owes the person, said once and reused. */
export const REJECT_UNAVAILABLE_SENTENCE =
  "Reject needs seo.withdraw_page_intents, which has no client wrapper yet — filed with the coordinator.";

export function IntentReviewDeck({ context, items, onSettled }: IntentReviewDeckProps) {
  const dispatch = useAppDispatch();
  const review = useAppSelector(selectMapReview(context.mapId));
  const write = useSetPageIntents(context.mapId);
  // The knob sets the mode; the person may disagree for one sitting without an
  // admin, and that override is theirs until they leave.
  const [modeOverride, setModeOverride] = useState<ReviewMode | null>(null);
  const [rejectAttempted, setRejectAttempted] = useState(false);

  const proposed = items.filter((item) => item.intent?.state === "proposed");
  const byId = new Map(proposed.map((item) => [item.page.id, item]));

  const deckItems: ReviewItem[] = proposed.map((item) => toReviewItem(item, context));

  async function accept(ids: string[]): Promise<void> {
    const bySite = new Map<string, SetPageIntentsItem[]>();
    for (const id of ids) {
      const item = byId.get(id);
      const intent = item?.intent;
      const siteId = item?.page.site_id;
      if (!item || !intent || !siteId) continue;
      const entry = acceptedItemFor(item);
      if (!entry) continue;
      const existing = bySite.get(siteId);
      if (existing) existing.push(entry);
      else bySite.set(siteId, [entry]);
    }

    const written: SetPageIntentsOutcome[] = [];
    for (const [siteId, batch] of bySite) {
      const result = await write.mutateAsync({
        siteId,
        items: batch,
        source: "human",
      });
      written.push(toSetPageIntentsOutcome(result));
    }
    const outcome = mergeSetPageIntentsOutcomes(written);
    const line = setPageIntentsOutcomeLine(outcome);
    if (outcome.failed > 0) toast.warning(line);
    else toast.success(line);
    onSettled(outcome);
  }

  function reject(): never {
    setRejectAttempted(true);
    // Nothing failed silently: the sentence is on screen beside the control AND
    // in the Error Inspector, because a control that cannot act is a defect
    // somebody has to close.
    toast.error(REJECT_UNAVAILABLE_SENTENCE);
    throw new Error(REJECT_UNAVAILABLE_SENTENCE);
  }

  function consequence(ids: string[], verb: "accept" | "reject"): string {
    if (verb === "reject") return REJECT_UNAVAILABLE_SENTENCE;
    const writable = ids.filter((id) => {
      const item = byId.get(id);
      return Boolean(item?.page.site_id) && Boolean(acceptedItemFor(item));
    });
    const skipped = ids.length - writable.length;
    const sentences = [
      `Accept ${writable.length} page${writable.length === 1 ? "" : "s"}: each page's own proposed destination is written again as the person's decision (state accepted, source human). Where it is going does not change.`,
    ];
    if (skipped > 0) {
      sentences.push(
        `${skipped} cannot be accepted from here — its destination has left the map or the list gave it no site — and ${skipped === 1 ? "is" : "are"} left as proposed.`,
      );
    }
    return sentences.join(" ");
  }

  return (
    <ReviewDeck
      items={deckItems}
      mode={modeOverride ?? (context.knobs.intent_review_mode as ReviewMode)}
      onModeChange={setModeOverride}
      cursorId={review.cursorPageId}
      onCursorChange={(pageId) =>
        dispatch(setReviewCursor({ mapId: context.mapId, pageId }))
      }
      onAccept={accept}
      onReject={reject}
      acceptLabel="Accept"
      rejectLabel="Reject"
      rejectOptions={
        <span
          role={rejectAttempted ? "alert" : undefined}
          className="max-w-xs text-[11px] text-muted-foreground"
        >
          {REJECT_UNAVAILABLE_SENTENCE}
        </span>
      }
      consequence={consequence}
      emptyState="No proposed destinations to review — run Propose destinations."
    />
  );
}

/**
 * The row's own intent, re-sent as the person's decision. Null when it cannot be
 * re-sent EXACTLY as it stands — a `merge`/`redirect` whose destination or topic
 * has left the map — because writing a different decision under the person's
 * name is the one thing this screen must never do.
 */
function acceptedItemFor(item: PageIntentItem | undefined): SetPageIntentsItem | null {
  const intent = item?.intent;
  if (!item || !intent) return null;
  const topicSlug = intent.topic?.slug ?? null;
  const note = intent.note ? { note: intent.note } : {};

  if (intent.disposition === "merge" || intent.disposition === "redirect") {
    const into = intent.into;
    if (!topicSlug || !into || "hidden" in into) return null;
    if (into.type === "web_page") {
      return {
        page_id: item.page.id,
        disposition: intent.disposition,
        topic_slug: topicSlug,
        into_page_id: into.id,
        state: "accepted",
        ...note,
      };
    }
    if (into.type === "plan_node") {
      return {
        page_id: item.page.id,
        disposition: intent.disposition,
        topic_slug: topicSlug,
        into_node_id: into.id,
        state: "accepted",
        ...note,
      };
    }
    return null;
  }

  if (intent.disposition === "move") {
    if (!topicSlug) return null;
    return {
      page_id: item.page.id,
      disposition: "move",
      topic_slug: topicSlug,
      state: "accepted",
      ...note,
    };
  }

  // keep / rewrite / delete. Sending the slug when the server rendered one
  // keeps the decision identical; omitting it would let the writer re-derive a
  // different topic from the page's coverage.
  return topicSlug
    ? {
        page_id: item.page.id,
        disposition: intent.disposition,
        topic_slug: topicSlug,
        state: "accepted",
        ...note,
      }
    : {
        page_id: item.page.id,
        disposition: intent.disposition,
        state: "accepted",
        ...note,
      };
}

function toReviewItem(
  item: PageIntentItem,
  context: IntentReviewDeckProps["context"],
): ReviewItem {
  const intent = item.intent;
  const destination = intent?.topic
    ? intent.topic.name
    : // ROUND 22: the intent survives its topic being hidden. A blank here
      // would read as "no destination"; this says what actually happened.
      "destination left the map";
  const state = pageTopicState(pageTopicViewOf(item));

  return {
    id: item.page.id,
    title: item.page.label ?? item.page.url ?? item.page.id,
    subtitle: intent
      ? `${intent.disposition} → ${destination} · by ${intent.source}`
      : "no intent recorded",
    meta: (
      <span className="flex flex-wrap items-center gap-1.5">
        {item.current_topics.length > 0 ? (
          item.current_topics.map((topic) => (
            <span
              key={topic.slug}
              className="rounded border border-border bg-muted/50 px-1 py-0.5 text-[11px] text-muted-foreground"
            >
              {topic.name}
            </span>
          ))
        ) : (
          // `current_topics: []` is a real state — "on no topic" — never a
          // blank cell.
          <span className="rounded border border-dashed border-border px-1 py-0.5 text-[11px] text-muted-foreground">
            on no topic
          </span>
        )}
        <IntentDot tone={state} colors={context.knobs.intent_colors} />
        {/* Absent is not zero: a hidden `web_page` ref carries no traffic at
            all, and `clicks: 0` is a real zero. */}
        {item.page.clicks != null ? (
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {item.page.clicks} clicks / {item.page.impressions ?? 0} impressions
          </span>
        ) : null}
      </span>
    ),
    body: (
      <span className="flex flex-col gap-1">
        {intent?.note ? <span className="whitespace-pre-wrap">{intent.note}</span> : null}
        {intent?.into && !("hidden" in intent.into) ? (
          <span className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">into</span>
            <EntityRef
              token={intent.into.type}
              id={intent.into.id}
              name={intent.into.label ?? intent.into.url ?? null}
              openInNewTab
            />
          </span>
        ) : intent?.into ? (
          <span className="text-[11px] text-muted-foreground">
            It points at a {intent.into.type} you cannot open.
          </span>
        ) : null}
      </span>
    ),
  };
}
