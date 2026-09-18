"use client";

/**
 * PAGES — `seo.list_page_intents`: where every page related to this map sits
 * today, and where its one intent is sending it.
 *
 * Moved out of `TopicalMapWorkspaceBody` unchanged (Phase 0). Lane F builds the
 * real bulk convergence workspace on this same read.
 *
 * ROUND 22 is load-bearing here and the reason this screen says so many things
 * out loud: a page never vanishes with its topic, `current_topics: []` is a
 * real state, and an intent whose destination left the map keeps the intent but
 * loses the `topic` key. Printing a blank cell for any of those would read as
 * "nothing to do".
 */

import { useAppSelector } from "@/lib/redux/hooks";

import {
  TopicalMapEmpty,
  TopicalMapFailed,
  TopicalMapLoading,
} from "../components/TopicalMapStates";
import type { MapViewProps } from "../components/TopicalMapWorkspaceBody";
import { usePageIntents } from "../hooks";
import {
  pageTopicState,
  pageTopicViewOf,
  selectMapDuplicateIntents,
  selectPagesOnNoTopic,
} from "../redux/selectors";
import type { PageTopicState } from "../redux/types";

/**
 * What each {@link PageTopicState} means, said out loud. Lane F draws these with
 * the `intent_colors` knob; this harness list has no colour, so it says the
 * words — a state a screen cannot colour must still be a state a screen names.
 */
const PAGE_TOPIC_STATE_SENTENCE: Record<PageTopicState, string> = {
  in_place: "staying where it is",
  leaving: "leaving the topic it covers",
  arriving: "arriving at a topic it does not cover yet",
  on_no_topic: "on no topic and going nowhere",
  intent_topic_hidden: "its destination left the map — re-route it",
};

export function PagesWorkspace({ mapId, siteId }: MapViewProps) {
  const intents = usePageIntents(mapId, { siteId });
  const duplicates = useAppSelector(selectMapDuplicateIntents(mapId));
  const onNoTopic = useAppSelector(selectPagesOnNoTopic(mapId));

  if (intents.isPending) return <TopicalMapLoading what="this map's pages" />;
  if (intents.isError)
    return <TopicalMapFailed what="this map's pages" error={intents.error} />;

  return (
    <>
      <section className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Pages
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {intents.data.total} page(s) · traffic over the last{" "}
          {intents.data.performance_window_days} days
          {siteId ? "" : " · every site you can view that uses this map"}
        </p>
        {/* ROUND 22: rejecting or retiring a topic does not delete its pages —
            they land here, on no topic. Saying nothing would let a map quietly
            shed its pages, which is the defect the migration was written for. */}
        {onNoTopic.length > 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {onNoTopic.length} of these page(s) cover no live topic of this map.
            A page never vanishes with its topic: rejecting or retiring a topic
            leaves its pages here to be re-homed.
          </p>
        ) : null}
        {/* ONE INTENT PER PAGE is the contract. A non-zero count means edges had
            to be collapsed, and the screen says so rather than showing one. */}
        {duplicates > 0 ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {duplicates} page(s) carry more than one intent edge. Only the newest
            is shown for each. That should not happen — one intent per page is
            enforced by seo.set_page_intents, so another writer created them.
          </p>
        ) : null}
      </section>

      {intents.data.items.length === 0 ? (
        <TopicalMapEmpty
          title="No pages are related to this map yet"
          detail="A page appears here once it covers a topic or carries an intent. The page mapper writes the coverage edges; the intent proposer and the bulk workspace write the intents."
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {intents.data.items.map((item) => {
            const state = pageTopicState(pageTopicViewOf(item));
            return (
              <li key={item.page.id} className="px-3 py-2 text-sm">
                <p className="truncate">
                  {item.page.url ?? item.page.label ?? item.page.id}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {/* ROUND 22: `current_topics: []` is a real state — a page
                      whose only topic was rejected or retired — so it is named,
                      never rendered as an empty phrase. */}
                  {item.current_topics.length > 0
                    ? `covers ${item.current_topics.map((topic) => topic.slug).join(", ")}`
                    : "on no topic"}
                  {item.intent ? (
                    <>
                      {` · ${item.intent.disposition} → `}
                      {item.intent.topic ? (
                        `${item.intent.topic.slug} (${item.intent.state})`
                      ) : (
                        /* The intent survives its topic being hidden and the
                           server stops rendering the topic. A blank cell here
                           would read as "no destination"; this says what
                           actually happened and what it means. */
                        <span className="text-destructive">
                          a topic that has left the map ({item.intent.state})
                        </span>
                      )}
                    </>
                  ) : (
                    " · no intent recorded"
                  )}
                  {` · ${PAGE_TOPIC_STATE_SENTENCE[state]}`}
                  {item.page.clicks != null
                    ? ` · ${item.page.clicks} clicks / ${item.page.impressions ?? 0} impressions`
                    : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
