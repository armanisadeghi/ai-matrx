// features/marketing/seo/topical-map/views/table/intentRollup.ts
//
// The table's two convergence columns — LEAVING and ARRIVING — are per-topic
// rollups of the page intents the workspace holds (PLAN §6 B). One page is
// two different colours depending on whose row is being drawn, which is why
// the rollup walks every topic a page touches (the topics it covers today AND
// the topic its intent names) and asks `pageIntentTone` the same question
// every other view asks: "how should THIS topic's row draw THIS page?".
//
// 🚨 ABSENT IS NOT ZERO. The store holds intents only after
// `seo.list_page_intents` has been read into it; before that every topic's
// rollup is UNDEFINED and the cell renders nothing. A topic that is present in
// the map but has no entry in the returned Map after a load DID load and has
// zero pages moving — the caller distinguishes the two by whether the intents
// were listed at all, never by the Map alone.

import { pageIntentTone } from "../../redux/selectors";
import type { PageIntentView } from "../../redux/types";
import type { PageIntentRecord } from "../../types";

export interface TopicIntentRollup {
  /** Pages that cover this topic today and whose intent sends them elsewhere. */
  leaving: number;
  /** Pages whose intent names this topic and which do not cover it yet. */
  arriving: number;
}

/**
 * Per-topic leaving/arriving counts over every intent the store holds.
 *
 * `coverageByPageId` is the store's own map (an entry holding `[]` is a page
 * on no topic, a real state since round 22). A page the intents list carries
 * but the coverage map does not is treated as covering nothing — the store
 * writes both from the same row, so that cannot happen for a listed page.
 */
export function rollupTopicIntents(
  intentsByPageId: Record<string, PageIntentRecord>,
  coverageByPageId: Record<string, string[]>,
): Map<string, TopicIntentRollup> {
  const out = new Map<string, TopicIntentRollup>();
  const bump = (slug: string, key: keyof TopicIntentRollup): void => {
    const entry = out.get(slug) ?? { leaving: 0, arriving: 0 };
    entry[key] += 1;
    out.set(slug, entry);
  };

  for (const [pageId, intent] of Object.entries(intentsByPageId)) {
    const view: PageIntentView = {
      pageId,
      disposition: intent.disposition,
      state: intent.state,
      intendedTopicSlug: intent.topic?.slug ?? null,
      currentTopicSlugs: coverageByPageId[pageId] ?? [],
    };
    const candidates = new Set<string>(view.currentTopicSlugs);
    if (view.intendedTopicSlug) candidates.add(view.intendedTopicSlug);
    for (const slug of candidates) {
      const tone = pageIntentTone(view, slug);
      if (tone === "leaving") bump(slug, "leaving");
      else if (tone === "arriving") bump(slug, "arriving");
    }
  }
  return out;
}
