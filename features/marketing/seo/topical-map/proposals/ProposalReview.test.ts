// features/marketing/seo/topical-map/proposals/ProposalReview.test.ts
//
// The deck lists proposals in TREE ORDER — a proposed child right after its
// proposed parent — read from the REAL reducer fed a `seo.map_tree`-shaped
// payload, so nothing is asserted against a hand-built workspace. Watched
// failing first with the walk replaced by `Object.values(topicsBySlug)`: the
// order followed insertion, not the tree.

import { RECORDED_FACTORY_PLAYGROUND_TREE } from "./__fixtures__/factoryPlaygroundRecorded";
import { DOCUMENTED_MAP_TREE } from "./__fixtures__/mapTopicProposalDocumented";
import { proposedTopicsInTreeOrder } from "./ProposalReview";
import reducer, { mapOpened, mapTreeLoaded } from "../redux/slice";

const MAP_ID = DOCUMENTED_MAP_TREE.map_id;

describe("proposedTopicsInTreeOrder", () => {
  it("lists only proposed topics, parents before children, siblings in tree order", () => {
    let slice = reducer(undefined, mapOpened({ mapId: MAP_ID }));
    slice = reducer(
      slice,
      mapTreeLoaded({ mapId: MAP_ID, result: DOCUMENTED_MAP_TREE, includes: ["status", "counts"] }),
    );
    const ws = slice.maps[MAP_ID];
    const proposed = proposedTopicsInTreeOrder(ws.topicsBySlug, ws.rootSlugs);
    expect(proposed.map((t) => t.slug)).toEqual([
      "metals",
      "metals-copper",
      "metals-aluminum",
      "e-waste",
    ]);
    // The active root is not a proposal.
    expect(proposed.some((t) => t.slug === "recycling")).toBe(false);
  });

  it("lists all 52 of Factory Playground's RECORDED proposals, roots first, in the tree's own order", () => {
    let slice = reducer(undefined, mapOpened({ mapId: RECORDED_FACTORY_PLAYGROUND_TREE.map_id }));
    slice = reducer(
      slice,
      mapTreeLoaded({
        mapId: RECORDED_FACTORY_PLAYGROUND_TREE.map_id,
        result: RECORDED_FACTORY_PLAYGROUND_TREE,
        includes: ["description", "status", "counts"],
      }),
    );
    const ws = slice.maps[RECORDED_FACTORY_PLAYGROUND_TREE.map_id];
    const proposed = proposedTopicsInTreeOrder(ws.topicsBySlug, ws.rootSlugs);
    expect(proposed).toHaveLength(52);
    expect(proposed.slice(0, 3).map((t) => t.slug)).toEqual([
      "it-asset-disposition",
      "asset-collection-logistics",
      "on-site-asset-pickup",
    ]);
  });

  it("is empty when nothing is proposed", () => {
    expect(proposedTopicsInTreeOrder({}, [])).toEqual([]);
  });
});
