// features/marketing/seo/topical-map/views/outline/__fixtures__/pageAssociationsShape.ts
//
// 🚨 SHAPE TRANSCRIBED FROM THE MIGRATION, NOT RECORDED BYTES. Follows
// `seo.map_topic_associations` (aidream migration
// `20260916100000_seo_topical_map_19_page_intents.sql`) narrowed with
// `p_kinds = '{pages}'` (alias of `web_page`):
//
//   { topic, association: jsonb_strip_nulls({kind, role, direction, payload}),
//     item: seo._tm_item('web_page', id) }
//
// where `_tm_item` for a page the caller can open is
// `{type:'web_page', id, label, url, clicks, impressions, performance_window_days}`
// (round 19) and a page the caller cannot open is counted once per
// (kind, direction) as `{ item: { type, hidden: N } }` (round 18).
//
// A `covers` payload is `{confidence, source}` (the mapper's, migration 23);
// an `intent` payload is the `map_page_intent` kind `{disposition, state, source, …}`.
// The uuids and urls are invented; the world they describe is the one the
// outline has to draw honestly:
//
//   in-place    covers here, no intent anywhere         → in_place
//   staying     covers here + intent(keep) here         → in_place (one row, not two)
//   arriving    intent(redirect) here, no covers        → arriving
//   leaving     covers here, workspace intent → elsewhere (listed) → leaving
//   condemned   covers here + intent(delete) here       → delete
//   hidden      2 pages the caller cannot open          → one "cannot open" row

import type { MapTopicAssociation } from "../../../types";

export const TOPIC_SLUG = "electronics-recycling";

const PAGE = (id: string, path: string, clicks: number) => ({
  type: "web_page" as const,
  id,
  label: `https://allgreen.example/${path}`,
  url: `https://allgreen.example/${path}`,
  clicks,
  impressions: clicks * 9,
  performance_window_days: 28,
});

export const PAGE_IN_PLACE = PAGE("11111111-1111-4111-8111-111111111111", "electronics", 140);
export const PAGE_STAYING = PAGE("22222222-2222-4222-8222-222222222222", "electronics/pickup", 33);
export const PAGE_ARRIVING = PAGE("33333333-3333-4333-8333-333333333333", "old/tv-disposal", 0);
export const PAGE_LEAVING = PAGE("44444444-4444-4444-8444-444444444444", "electronics/city/fresno", 0);
export const PAGE_CONDEMNED = PAGE("55555555-5555-4555-8555-555555555555", "electronics/old-promo", 0);

export const PAGE_ASSOCIATIONS: MapTopicAssociation[] = [
  {
    topic: TOPIC_SLUG,
    association: { kind: "web_page", role: "covers", direction: "in", payload: { confidence: 88, source: "mapper" } },
    item: PAGE_IN_PLACE,
  },
  {
    topic: TOPIC_SLUG,
    association: { kind: "web_page", role: "covers", direction: "in", payload: { confidence: 80, source: "mapper" } },
    item: PAGE_STAYING,
  },
  {
    topic: TOPIC_SLUG,
    association: {
      kind: "web_page",
      role: "intent",
      direction: "in",
      payload: { disposition: "keep", state: "accepted", source: "human" },
    },
    item: PAGE_STAYING,
  },
  {
    topic: TOPIC_SLUG,
    association: {
      kind: "web_page",
      role: "intent",
      direction: "in",
      payload: { disposition: "redirect", state: "proposed", source: "agent", into_page_id: PAGE_IN_PLACE.id },
    },
    item: PAGE_ARRIVING,
  },
  {
    topic: TOPIC_SLUG,
    association: { kind: "web_page", role: "covers", direction: "in", payload: { confidence: 61, source: "mapper" } },
    item: PAGE_LEAVING,
  },
  {
    topic: TOPIC_SLUG,
    association: { kind: "web_page", role: "covers", direction: "in", payload: { confidence: 70, source: "mapper" } },
    item: PAGE_CONDEMNED,
  },
  {
    topic: TOPIC_SLUG,
    association: {
      kind: "web_page",
      role: "intent",
      direction: "in",
      payload: { disposition: "delete", state: "proposed", source: "agent" },
    },
    item: PAGE_CONDEMNED,
  },
  {
    topic: TOPIC_SLUG,
    association: { kind: "web_page", direction: "in" },
    item: { type: "web_page", hidden: 2 },
  },
];
