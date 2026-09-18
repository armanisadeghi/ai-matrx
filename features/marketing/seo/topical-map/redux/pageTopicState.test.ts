// features/marketing/seo/topical-map/redux/pageTopicState.test.ts
//
// The round-22 selector, run against RECORDED SERVER BYTES
// (`./__fixtures__/listPageIntentsRound22.ts`) rather than a payload written to
// match it. That distinction is the whole value of this file: the defect the
// migration fixed was a disagreement between what the server returns and what
// a reader assumed it returns, and a hand-made fixture would encode the
// assumption a second time instead of testing it.
//
// It also drives the real slice reducer, so `coverageByPageId` — the store
// field `selectPagesOnNoTopic` reads — is filled the way a live screen fills
// it, not by hand.

import { RECORDED_PAGE_INTENTS_ROUND22 } from "./__fixtures__/listPageIntentsRound22";
import {
  pageTopicState,
  pageTopicViewOf,
  selectPageTopicState,
  selectPagesOnNoTopic,
} from "./selectors";
import reducer, { mapOpened, pageIntentsLoaded } from "./slice";
import type { PageIntentItem } from "../types";
import type { TopicalMapSliceState } from "./types";

const MAP_ID = "round-22-recorded";

function pageNamed(tag: string): PageIntentItem {
  const hit = RECORDED_PAGE_INTENTS_ROUND22.items.find((item) =>
    (item.page.url ?? "").endsWith(`/${tag}`),
  );
  if (!hit) throw new Error(`the recorded payload has no page /${tag}`);
  return hit;
}

function storeWithRecordedPayload(): { topicalMap: TopicalMapSliceState } {
  let slice = reducer(undefined, mapOpened({ mapId: MAP_ID }));
  slice = reducer(
    slice,
    pageIntentsLoaded({
      mapId: MAP_ID,
      result: RECORDED_PAGE_INTENTS_ROUND22,
      replace: true,
    }),
  );
  return { topicalMap: slice };
}

describe("round 22 — a page never vanishes", () => {
  it("the recorded payload really carries the two states this round created", () => {
    // If these ever stop being true the fixture was re-recorded against a
    // different world and every assertion below is measuring nothing.
    expect(pageNamed("orphan-one").current_topics).toEqual([]);
    expect(pageNamed("orphan-one").intent).not.toBeNull();
    expect(pageNamed("orphan-one").intent?.topic).toBeUndefined();
    expect(pageNamed("mover").intent?.topic?.slug).toBe("live-there");
  });

  it.each([
    ["p1", "in_place"],
    ["p2", "in_place"],
    ["mover", "leaving"],
    ["arriver", "arriving"],
    ["orphan-one", "intent_topic_hidden"],
    ["orphan-two", "intent_topic_hidden"],
  ] as const)("reads /%s as %s", (tag, expected) => {
    expect(pageTopicState(pageTopicViewOf(pageNamed(tag)))).toBe(expected);
  });

  it("a page with no live coverage and no intent at all is on_no_topic", () => {
    // The one state the recorded world does not contain, built by REMOVING the
    // intent from a recorded row rather than by inventing a row: the server's
    // own `current_topics: []` bytes are what is under test.
    const bare = { ...pageNamed("orphan-one"), intent: null };
    expect(bare.current_topics).toEqual([]);
    expect(pageTopicState(pageTopicViewOf(bare))).toBe("on_no_topic");
  });

  it("the slice stores empty coverage, so selectPagesOnNoTopic finds it", () => {
    const state = storeWithRecordedPayload();
    const onNoTopic = selectPagesOnNoTopic(MAP_ID)(state as never);
    // `seo.map_diagnostics` on the same recorded world answered
    // `pages_on_no_topic: 3` — the two orphans and the arriver.
    expect([...onNoTopic].sort()).toEqual(
      [
        pageNamed("arriver").page.id,
        pageNamed("orphan-one").page.id,
        pageNamed("orphan-two").page.id,
      ].sort(),
    );
  });

  it("a page the read never listed is absent, not 'covers nothing'", () => {
    const state = storeWithRecordedPayload();
    const onNoTopic = selectPagesOnNoTopic(MAP_ID)(state as never);
    expect(onNoTopic).not.toContain("a-page-nobody-listed");
  });

  it("the store-backed selector agrees with the pure function", () => {
    const state = storeWithRecordedPayload();
    for (const tag of ["p1", "mover", "arriver", "orphan-one"]) {
      const item = pageNamed(tag);
      expect(selectPageTopicState(MAP_ID, item.page.id)(state as never)).toBe(
        pageTopicState(pageTopicViewOf(item)),
      );
    }
  });
});
