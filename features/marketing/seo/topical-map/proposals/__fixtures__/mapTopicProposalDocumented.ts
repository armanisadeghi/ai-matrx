// features/marketing/seo/topical-map/proposals/__fixtures__/mapTopicProposalDocumented.ts
//
// 🚨 NOT RECORDED — a DOCUMENTED-SHAPE fixture, and this file says so. No
// `seo.map_author_complete` event was available to record (running the author
// is minutes of paid work), so the proposal below is the shape `map-author.ts`
// documents for `map_topic_proposal_v1` / `map_topic_node_v1`, checked
// 2026-09-18 against the LIVE `content_ir.kind_definition` rows (proposal v2,
// node v3: flat, `parent_slug`, `__kind` const on every node, `status` enum
// proposed|active, `additionalProperties: false`). The RECORDED tree and
// history of Factory Playground live beside it in
// `factoryPlaygroundRecorded.ts` and drive every test that can run on real
// bytes; this one exists for the kind bridge, whose input only the author
// produces.
//
// The tree is deliberately OUT OF ORDER in one place — `metals-copper` is
// listed before its parent `metals` — because the kind's contract says a
// parent appears first and a model can break it; the flattener must rebuild
// the order rather than trust it.

import type { MapTopicProposal } from "../../map-author";
import type { MapTreeWholeResult } from "../../types";

export const DOCUMENTED_PROPOSAL: MapTopicProposal = {
  __kind: "map_topic_proposal_v1",
  summary:
    "A scrap-metal recycler serving the Los Angeles basin: what it buys, how pricing works, and where to bring it.",
  source_kind: "data",
  topics: [
    {
      __kind: "map_topic_node_v1",
      slug: "recycling",
      name: "Recycling",
      description: "The root: everything the yard accepts.",
      status: "active",
      parent_slug: null,
    },
    {
      __kind: "map_topic_node_v1",
      slug: "metals-copper",
      name: "Copper",
      description: "Bare bright, #1, #2 and insulated wire.",
      status: "proposed",
      parent_slug: "metals",
    },
    {
      __kind: "map_topic_node_v1",
      slug: "metals",
      name: "Metals",
      description: "Ferrous and non-ferrous scrap.",
      status: "proposed",
      parent_slug: "recycling",
    },
    {
      __kind: "map_topic_node_v1",
      slug: "metals-aluminum",
      name: "Aluminum",
      description: null,
      status: "proposed",
      parent_slug: "metals",
    },
    {
      __kind: "map_topic_node_v1",
      slug: "e-waste",
      name: "Electronics",
      description: "Computers, phones and appliances.",
      status: "proposed",
      parent_slug: "recycling",
    },
  ],
  coverage_notes:
    "The source names no geography beyond Los Angeles and no pricing page; both are still to settle.",
};

/** The same tree as `seo.map_tree` returns it — nested, counts included. */
export const DOCUMENTED_MAP_TREE: MapTreeWholeResult = {
  map_id: "ff2010ec-f53d-4d8b-81d9-094c4ca73397",
  root: null,
  total_topics: 5,
  topics: [
    {
      slug: "recycling",
      name: "Recycling",
      description: "The root: everything the yard accepts.",
      pages: 4,
      planned: 0,
      keywords: 12,
      children: [
        {
          slug: "metals",
          name: "Metals",
          status: "proposed",
          pages: 0,
          planned: 0,
          keywords: 0,
          children: [
            { slug: "metals-copper", name: "Copper", status: "proposed", pages: 0, planned: 0, keywords: 0 },
            { slug: "metals-aluminum", name: "Aluminum", status: "proposed", pages: 0, planned: 0, keywords: 0 },
          ],
        },
        { slug: "e-waste", name: "Electronics", status: "proposed", pages: 0, planned: 0, keywords: 0 },
      ],
    },
  ],
};
