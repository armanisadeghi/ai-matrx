// features/marketing/seo/topical-map/views/outline/__fixtures__/mapTreeShape.ts
//
// 🚨 SHAPE TRANSCRIBED FROM THE MIGRATION, NOT RECORDED BYTES. There is no
// recorded whole-tree `seo.map_tree` payload in either repo (checked
// 2026-09-18: the only recorded fixture is `redux/__fixtures__/listPageIntentsRound22.ts`,
// a `list_page_intents` answer). This file follows `seo._tm_tree_node` in
// aidream `packages/matrx-seo/matrx_seo/migrations/20260915200200_seo_topical_map_12_no_temp_tables.sql`
// key for key:
//
//   v_node := jsonb_build_object('slug', r.slug, 'name', r.name);
//   IF 'description' = ANY(p_include) THEN … 'description', r.description
//   IF 'status' = ANY(p_include) OR r.status <> 'active' THEN … 'status', r.status
//   IF 'counts' = ANY(p_include) THEN … 'pages', 'planned', 'keywords'
//   IF 'facets' = ANY(p_include) THEN … 'facets', {facet_key: value_slug} (or {})
//   children: 'children' (spath order) | 'children_count' | absent on a leaf
//   whole map: {map_id, root: null, topics, total_topics}
//
// The names are All Green Recycling's kind of topics, invented; the slugs are
// not the live map's. A verifier with database access replaces this with a
// recorded `seo.map_tree(e9df6779-…, NULL, NULL, '{description,status,counts,facets}', NULL)`
// and the tests below must still pass unchanged — that is the point of keeping
// the shape exact.

import type { MapTreeWholeResult } from "../../../types";

export const MAP_ID = "map-outline-shape";

/** `include = ['description','status','counts','facets']` — what the outline asks for. */
export const TREE_WITH_COUNTS: MapTreeWholeResult = {
  map_id: MAP_ID,
  root: null,
  total_topics: 6,
  topics: [
    {
      slug: "electronics-recycling",
      name: "Electronics recycling",
      description:
        "Everything about taking in end-of-life electronics: what we accept, how pickup works, and what happens to the material afterwards.",
      status: "active",
      pages: 12,
      planned: 1,
      keywords: 4,
      facets: { offering_kind: "service" },
      children: [
        {
          slug: "hard-drive-shredding",
          name: "Hard drive shredding",
          description: "On-site and off-site shredding with a certificate of destruction.",
          status: "active",
          pages: 3,
          planned: 0,
          keywords: 2,
          facets: { offering_kind: "service" },
        },
        {
          slug: "laptop-recycling",
          name: "Laptop recycling",
          description: null,
          status: "active",
          pages: 0,
          planned: 1,
          keywords: 0,
          facets: { offering_kind: "service" },
        },
      ],
    },
    {
      slug: "data-destruction",
      name: "Data destruction",
      description: "Proposed by the map author from the brand profile; not accepted yet.",
      status: "proposed",
      pages: 0,
      planned: 0,
      keywords: 0,
      facets: {},
      children: [
        {
          slug: "degaussing",
          name: "Degaussing",
          description: null,
          status: "proposed",
          pages: 0,
          planned: 0,
          keywords: 0,
          facets: {},
        },
      ],
    },
    {
      slug: "about-all-green",
      name: "About All Green",
      description: "Company, certifications, locations.",
      status: "active",
      pages: 5,
      planned: 0,
      keywords: 1,
      facets: {},
    },
  ],
};

/** `include = ['description','status']` — the SAME topics read without counts or facets. */
export const TREE_WITHOUT_COUNTS: MapTreeWholeResult = {
  map_id: MAP_ID,
  root: null,
  total_topics: 6,
  topics: [
    {
      slug: "electronics-recycling",
      name: "Electronics recycling",
      description:
        "Everything about taking in end-of-life electronics: what we accept, how pickup works, and what happens to the material afterwards.",
      status: "active",
      children: [
        {
          slug: "hard-drive-shredding",
          name: "Hard drive shredding",
          description: "On-site and off-site shredding with a certificate of destruction.",
          status: "active",
        },
        { slug: "laptop-recycling", name: "Laptop recycling", description: null, status: "active" },
      ],
    },
    {
      slug: "data-destruction",
      name: "Data destruction",
      description: "Proposed by the map author from the brand profile; not accepted yet.",
      status: "proposed",
      children: [
        { slug: "degaussing", name: "Degaussing", description: null, status: "proposed" },
      ],
    },
    {
      slug: "about-all-green",
      name: "About All Green",
      description: "Company, certifications, locations.",
      status: "active",
    },
  ],
};
