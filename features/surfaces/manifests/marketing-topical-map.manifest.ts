/**
 * Surface manifest — Topical Map (`matrx-user/marketing-topical-map`).
 *
 * The Content section's home and one map's workspace:
 * `/marketing/[brandId]/content`, `/content/map`, and
 * `/content/map/[mapId]` with its six screens (outline, table, graph, text,
 * pages, history). The map decides WHICH pages a brand should have and WHERE
 * they live; the content plan beside it — its own surfaces,
 * `matrx-user/content-plan*` — decides what one page says. Two different jobs,
 * two different sets of agents, so two surfaces.
 *
 * NOT inherited from a content-plan surface: nothing in that family's
 * vocabulary (site, plan node, brief, pipeline) applies to a brand-owned tree
 * of topics, and inheriting it would hand an agent here a site it does not have.
 *
 * Runtime emitter: the workspace body mounts the scope built by
 * `createMarketingTopicalMapScope` below; until it does, this manifest is
 * `partial` and says so.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "map_identity",
    label: "Map identity",
    sortOrder: 100,
    description: "Which brand's map is open, and which screen of it.",
  },
  {
    key: "map_tree",
    label: "Map tree",
    sortOrder: 200,
    description:
      "The topics themselves, plus what the person has selected and opened.",
  },
  {
    key: "map_convergence",
    label: "Pages and convergence",
    sortOrder: 300,
    description:
      "Where the brand's existing pages sit today and where each one is going.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "brand_id",
    label: "Brand",
    description:
      "UUID of the brand whose maps are open. A map belongs to a brand, never to a site.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "map_identity",
    sortOrder: 100,
  },
  {
    name: "map_id",
    label: "Active map",
    description:
      "UUID of the open topical map. Empty on the Content home, where a list of the brand's maps is shown instead.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "map_identity",
    sortOrder: 110,
  },
  {
    name: "map_name",
    label: "Map name",
    description: "Display name of the open map. Empty while it loads.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "map_identity",
    sortOrder: 120,
  },
  {
    name: "map_screen",
    label: "Screen",
    description:
      "Which screen of the workspace is open: outline, table, graph, text, pages or history. Views are routes, so this is the path, not a tab.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    group: "map_identity",
    sortOrder: 130,
  },
  {
    name: "site_id",
    label: "Site in scope",
    description:
      "The site the counts and page reads are narrowed to (`?site=`). Empty means every site the caller may view that uses this map — never 'all sites'.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "map_identity",
    sortOrder: 140,
  },
  {
    name: "map_outline",
    label: "Map outline",
    description:
      "The whole map as `seo.map_outline` renders it — the exact text an agent is given for this map. Empty until the tree loads or when the map has no topics.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    group: "map_tree",
    sortOrder: 200,
  },
  {
    name: "topic_total",
    label: "Topic total",
    description:
      "How many topics the map holds, as `seo.map_tree` counts them. Empty while the tree loads.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "map_tree",
    sortOrder: 210,
  },
  {
    name: "selected_topic_slug",
    label: "Selected topic",
    description:
      "Slug of the topic the person has selected. Slugs are the agent-facing key. Empty when nothing is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    group: "map_tree",
    sortOrder: 220,
  },
  {
    name: "expanded_topic_slugs",
    label: "Open branches",
    description:
      "Slugs of the branches the person has opened. Survives switching views, because views are routes.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "map_tree",
    sortOrder: 230,
  },
  {
    name: "visible_topics",
    label: "Visible topics",
    description:
      "The rows currently on screen: slug, name, depth, status and — when the tree was loaded with counts — pages, planned pages and keywords. Exactly what the person can see, filters and collapsed branches applied.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 5000,
    group: "map_tree",
    sortOrder: 240,
  },
  {
    name: "map_diagnostics",
    label: "Diagnostics",
    description:
      "`seo.map_diagnostics` for this map: empty topics, crowded topics, still-proposed topics, pages on many topics, pages on no topic, retired topics that still carry attachments.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    group: "map_tree",
    sortOrder: 250,
  },
  {
    name: "page_intents",
    label: "Page intents",
    description:
      "One row per page related to this map: the page, the topics it covers today, its one intent (keep, move, merge, redirect, rewrite, delete) and its Search Console clicks and impressions. Only on the pages screen.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    group: "map_convergence",
    sortOrder: 300,
  },
  {
    name: "page_intent_total",
    label: "Page total",
    description:
      "How many pages the intents read matched, before paging. Only on the pages screen.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    group: "map_convergence",
    sortOrder: 310,
  },
  {
    name: "map_history",
    label: "History",
    description:
      "Topics that were rejected or retired, with who changed them and when. Rejecting never deletes. Only on the history screen.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    group: "map_convergence",
    sortOrder: 320,
  },
];

export const marketingTopicalMapManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-topical-map",
  label: "Topical Map",
  readiness: "stub",
  readinessNote:
    "Declared with the U1 data layer and the route scaffold (2026-09-17). No SurfaceRuntimeProvider is mounted yet and no agent is bound: the view builders (U2/U3/U5/U6) own the emitter, and the map/topic agents are U7. Every value below is declared against the reads that already run.",
  urlPattern: "/marketing/[brandId]/content/map/[mapId]",
  intro: `<surface_intro>
You are in a brand's TOPICAL MAP: the tree of subjects this brand should cover, and the plan for getting its website there. The map decides WHICH pages should exist and WHERE they live; the content plan, a separate surface, decides what one page says.
Topics are addressed by SLUG, never by id. visible_topics is what the person can actually see right now — filters applied, collapsed branches excluded — while map_outline is the whole map. A count that is absent was not loaded; it never means zero.
On the pages screen, page_intents is the convergence plan: each page is somewhere today (the topics it covers) and going somewhere (its one intent). A page is "leaving" the topic it covers and "arriving" at the topic its intent names — the same page is two different colours depending on which topic's row you are reading.
Every change goes through the topical_map tool, never by writing rows.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/** Type-safe payload helper — nothing is guaranteed while the reads hydrate. */
export function createMarketingTopicalMapScope(values: {
  brand_id?: string;
  map_id?: string;
  map_name?: string;
  map_screen?: string;
  site_id?: string;
  map_outline?: string;
  topic_total?: number;
  selected_topic_slug?: string;
  expanded_topic_slugs?: string[];
  visible_topics?: Array<Record<string, unknown>>;
  map_diagnostics?: Record<string, unknown>;
  page_intents?: Array<Record<string, unknown>>;
  page_intent_total?: number;
  map_history?: Array<Record<string, unknown>>;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
