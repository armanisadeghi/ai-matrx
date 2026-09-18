// features/marketing/seo/topical-map/views/table/__tests__/intentRollup.test.ts
//
// The leaving/arriving columns are rollups over `seo.list_page_intents`. This
// drives the REAL reducer with the RECORDED round-22 payload (planted and read
// on the live database inside one rolled-back transaction — see the fixture's
// header) and reads the rollup off the store the table reads, so the numbers
// asserted are the server's answers, not this file's opinion.
//
// Watched failing first: counting `intended` alone (without asking the tone)
// puts the two orphans' pages into nobody's column but ALSO counts the mover
// as arriving at live-here; the tone-based walk below does not.

import { RECORDED_PAGE_INTENTS_ROUND22 } from "../../../redux/__fixtures__/listPageIntentsRound22";
import reducer, { mapOpened, pageIntentsLoaded } from "../../../redux/slice";
import type { TopicalMapSliceState } from "../../../redux/types";
import { rollupTopicIntents } from "../intentRollup";

const MAP_ID = "map-rollup";

function loaded(): TopicalMapSliceState {
  let slice = reducer(undefined, mapOpened({ mapId: MAP_ID }));
  slice = reducer(
    slice,
    pageIntentsLoaded({ mapId: MAP_ID, result: RECORDED_PAGE_INTENTS_ROUND22, replace: true }),
  );
  return slice;
}

describe("rollupTopicIntents over the recorded round-22 payload", () => {
  const ws = loaded().maps[MAP_ID];
  const rollups = rollupTopicIntents(ws.intentsByPageId, ws.coverageByPageId);

  it("counts the arriver and the mover as ARRIVING at live-there", () => {
    expect(rollups.get("live-there")).toEqual({ leaving: 0, arriving: 2 });
  });

  it("counts the mover as LEAVING live-here, and nothing as arriving there", () => {
    expect(rollups.get("live-here")).toEqual({ leaving: 1, arriving: 0 });
  });

  it("gives the orphans (intent with NO topic key) and the intent-less pages no column at all", () => {
    // alpha and sect-b are covered only by pages with no intent; the two
    // orphans cover nothing and name nothing live. None of them moves a count.
    expect(rollups.has("alpha")).toBe(false);
    expect(rollups.has("sect-b")).toBe(false);
    expect([...rollups.keys()].sort()).toEqual(["live-here", "live-there"]);
  });

  it("returns an empty map — never zeroes — when nothing has been listed", () => {
    expect(rollupTopicIntents({}, {}).size).toBe(0);
  });
});
