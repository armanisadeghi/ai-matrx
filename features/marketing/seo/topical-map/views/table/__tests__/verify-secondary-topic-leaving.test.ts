// features/marketing/seo/topical-map/views/table/__tests__/verify-secondary-topic-leaving.test.ts
//
// VERIFIER-B attack on the builder's own claim (allGreen.test.tsx's header
// comment): "all 19 redirects stay in_place (a page sent to another page of
// the SAME topic does not leave the topic)". That is true of the CRT topic
// each redirect names — but two of the 19 recorded rows ALSO cover
// "consumer-electronics-recycling" as a second, weaker `mapper` edge
// (confidence 60/62) that their intent does NOT name. Relative to THAT
// topic's row, `pageIntentTone` answers "leaving" — the page covers it today
// and its intent sends it to a page under a different topic. The claim in
// prose ("all 19 stay in_place") is therefore incomplete: it holds for the
// topic each intent names, not for every topic a page happens to cover.
//
// This is not a bug in Lane B's own code — `pageIntentTone` and
// `rollupTopicIntents` both answer the rollup's own stated definition
// ("pages that cover this topic today and whose intent sends them
// elsewhere") correctly and honestly for this input. It IS a place a reviewer
// or Arman reading the test file's comment alone would come away with a
// stronger claim than the code actually makes, so it is recorded here against
// the recorded fixture rather than left to the prose.

import { RECORDED_ALL_GREEN_MAP_TREE } from "../__fixtures__/allGreenMapTree";
import {
  RECORDED_ALL_GREEN_MOVE_INTENTS,
  RECORDED_ALL_GREEN_REDIRECT_INTENTS,
} from "../__fixtures__/allGreenPageIntents";
import reducer, { mapOpened, mapTreeLoaded, pageIntentsLoaded } from "../../../redux/slice";
import { rollupTopicIntents } from "../intentRollup";

const MAP_ID = RECORDED_ALL_GREEN_MAP_TREE.map_id;

function loadedWorkspace() {
  let slice = reducer(undefined, mapOpened({ mapId: MAP_ID }));
  slice = reducer(
    slice,
    mapTreeLoaded({
      mapId: MAP_ID,
      result: RECORDED_ALL_GREEN_MAP_TREE,
      includes: ["description", "status", "counts", "facets"],
    }),
  );
  slice = reducer(
    slice,
    pageIntentsLoaded({ mapId: MAP_ID, result: RECORDED_ALL_GREEN_MOVE_INTENTS, replace: true }),
  );
  slice = reducer(
    slice,
    pageIntentsLoaded({ mapId: MAP_ID, result: RECORDED_ALL_GREEN_REDIRECT_INTENTS, replace: false }),
  );
  return slice.maps[MAP_ID];
}

describe("VERIFIER-B: a redirect can still leave a SECONDARY topic it weakly covers", () => {
  it("consumer-electronics-recycling shows 2 leaving, from redirects whose intent names CRT instead", () => {
    const ws = loadedWorkspace();
    const rollups = rollupTopicIntents(ws.intentsByPageId, ws.coverageByPageId);

    // The CRT topic itself: every redirect it names is in_place, as the
    // builder's own fixture comment says — this is not being disputed.
    expect(rollups.get("crt-and-tv-recycling")).toBeUndefined();

    // But two of those same 19 rows carry a second `current_topics` entry
    // naming consumer-electronics-recycling, which their intent does not.
    // Relative to THAT row, the page is leaving — correctly, per
    // `rollupTopicIntents`'s own definition — and it is a real, non-zero
    // number a viewer of the table WILL see if that column is visible.
    expect(rollups.get("consumer-electronics-recycling")).toEqual({ leaving: 2, arriving: 0 });
  });
});
