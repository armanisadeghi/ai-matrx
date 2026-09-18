// features/marketing/seo/topical-map/panel/__fixtures__/mapTopicAssociationsRecorded.ts
//
// 🚨 RECORDED, NOT WRITTEN. `RECORDED_ASSOCIATIONS` and `RECORDED_FACETS` are
// the byte-for-byte answers of `seo.map_topic_associations` and
// `seo.map_topic_facets` on the live database (project brsgrqvjdzwihsvnfqkf)
// on 2026-09-18, for All Green Recycling's map `e9df6779-8e0e-45e9-a664-375e7d1ecffd`,
// topic `cable-and-wire-recycling`, read as admin@admin.com
// (`set local role authenticated` + `request.jwt.claims`, the way
// `test_topical_map_door_contract.py::_as` reads). Nothing was written.
//
// `COMPOSED_GENERIC_ROW` is NOT recorded, and says so in its name. No topic in
// the database carries an edge of a kind the panel does not special-case
// (every topic today pairs only with web_page and seo_map_facet_value; the
// registered pairs are plan_node, web_page, web_youtube_video and facet
// values), and planting one inside a rolled-back transaction was REFUSED by
// `platform.enforce_known_association` for an unregistered pair and needs a
// `users.integration_connection_resources` row for the registered
// web_youtube_video pair. So this row is composed from the function's own
// `jsonb_build_object` (migration `…_19_page_intents.sql` lines 392–447: the
// `topic` / `association{kind,role,direction,payload}` / `item` keys, the item
// being `platform.resolve_entity_ref`'s `{type,id,label,…}`), and it proves
// exactly one thing: the panel groups a kind by the string the function
// returns. It proves nothing about that function.

import type { MapTopicAssociation, MapTopicFacetsResult } from "../../types";

export const RECORDED_MAP_ID = "e9df6779-8e0e-45e9-a664-375e7d1ecffd";
export const RECORDED_SLUG = "cable-and-wire-recycling";

export const RECORDED_ASSOCIATIONS = [
  {
    item: {
      id: "0121be0d-e360-4cc4-9bb6-44a02c0cd89d",
      ref: null,
      slug: "service",
      type: "seo_map_facet_value",
      facet: "offering_kind",
      label: "Service",
    },
    topic: "cable-and-wire-recycling",
    association: { kind: "seo_map_facet_value", role: "facet", direction: "out" },
  },
  {
    item: {
      id: "bf089006-3b35-4b80-89b0-c8d3055ad8cb",
      url: "https://allgreenrecycling.com/wires-and-cable-recycling",
      type: "web_page",
      label: "https://allgreenrecycling.com/wires-and-cable-recycling",
      clicks: 2,
      status: "active",
      impressions: 586,
      performance_window_days: 28,
    },
    topic: "cable-and-wire-recycling",
    association: {
      kind: "web_page",
      role: "covers",
      payload: {
        reason:
          "Title and sections detail recycling processes for computer cables, power cords, and wires.",
        source: "mapper",
        confidence: 95,
      },
      direction: "in",
    },
  },
] as const satisfies readonly MapTopicAssociation[];

export const RECORDED_FACETS = {
  offering_kind: { ref: null, inherited: false, value_name: "Service", value_slug: "service" },
} as const satisfies MapTopicFacetsResult;

/** COMPOSED (see the header) — a registered pair the panel never special-cases. */
export const COMPOSED_GENERIC_ROW = {
  item: {
    id: "3b1f4d7e-6c2a-4a9e-9f1b-2d5e7c8a9b01",
    type: "web_youtube_video",
    label: "How we shred hard drives",
  },
  topic: "cable-and-wire-recycling",
  association: { kind: "web_youtube_video", role: "about", direction: "in" },
} as const satisfies MapTopicAssociation;
