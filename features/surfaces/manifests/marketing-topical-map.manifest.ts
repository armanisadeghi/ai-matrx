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
 * Runtime emitter: the workspace body (`TopicalMapWorkspaceBody`) mounts the
 * scope built by `createMarketingTopicalMapScope` below, in every host — page,
 * window, drawer, canvas, peek — because the provider lives in the body, not in
 * the route.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { MAP_CURATION_MANDATE_KEY } from "@/features/marketing/seo/topical-map/mandateKeys";

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
  readiness: "partial",
  readinessNote:
    "The workspace body mounts the SurfaceRuntimeProvider and emits this scope from the live store (2026-09-18): map_id, map_screen, site_id, topic_total, selected_topic_slug, expanded_topic_slugs, visible_topics, and page_intents on the pages screen. The rest fill in as the view builders land — map_outline, map_diagnostics and map_history are read by their screens but not emitted yet, and page_intent_total is deliberately absent because the slice holds the rows this workspace LISTED, not the server's matched total. agentRoles: seo.map_curation is declared (Lane G, with its 'Ask the map' launcher in the map window and the canvas pane); seo.map_author is declared (Lane E, with the Content home's Start a map screen and Extend from the site); seo.page_mapper and seo.page_intent_proposer are declared (Lane F, with the pages workspace's run controls); seo.topic_curation lands with the topic panel's control (Lane D), never ahead of it.",
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
  // Disclosure (agent-disclosure law): each role lands WITH the control that
  // runs it, never ahead of it. `map_curation` runs from the "Ask the map"
  // launcher in the map window and the chat canvas pane (Lane G); `map_author`
  // from the Content home (Lane E); the page mapper and the intent proposer
  // from the pages workspace's run controls (Lane F); the topic agent is added
  // by the lane that ships its control (CONTRACTS §6).
  agentRoles: [
    {
      name: "map_curation",
      label: "Topical Map Agent",
      description:
        "Reads and edits the whole open map through the topical_map tool — answers questions about it, proposes or applies topic changes under the map_agent_change_mode knob. Launched in place from the map window and the chat canvas pane.",
      kind: "single",
      defaultAgentId: null,
      mandateKey: MAP_CURATION_MANDATE_KEY,
      allowCustom: false,
      autoRun: "never",
      sortOrder: 100,
    },
    {
      // Lane E: runs from the Content home's "Start a map" screen and the
      // per-site "Extend from the site" control (`POST
      // /seo/brands/{brand_id}/map/author`, `useAuthorTopicalMap`). The key is
      // published by @ai-matrx/agents 0.12.5 (`seo__map_author`).
      name: "map_author",
      label: "Topical Map Author",
      description:
        "Authors a brand's topic tree from one chosen source — the brand's data, documents, a description, a web page, or research — and writes it to the map as active topics or proposals under the map_agent_change_mode knob. Runs from the Content home's Start a map screen and from Extend from the site.",
      kind: "single",
      defaultAgentId: null,
      mandateKey: MANDATE_KEYS.seo__map_author,
      allowCustom: false,
      autoRun: "never",
      sortOrder: 110,
    },
    // Lane F: the two fixed jobs the pages workspace runs behind its header
    // controls (`views/pages/runs/**`). Disclosure ONLY: these rows put the
    // mandates in the shell's top Agents menu and add nothing visible to the
    // screen.
    //
    // STRING LITERALS, not `MANDATE_KEYS`: the installed @ai-matrx/agents 0.12.5
    // has no `seo__page_mapper` / `seo__page_intent_proposer` — aidream's
    // regeneration (d2b14cee) added both for the first time and the package has
    // not republished. Both keys are named in `scripts/mandate-keys-allowlist.json`
    // with that reason; swap the literals for `MANDATE_KEYS` and drop those rows
    // on the first change here after the package publishes (CONTRACTS.md §6).
    {
      name: "page_mapper",
      label: "Page mapper",
      description:
        "Places this site's crawled pages onto the map's topics (covers edges) from the Map the pages control.",
      kind: "single",
      defaultAgentId: null,
      mandateKey: "seo.page_mapper",
      allowCustom: false,
      autoRun: "never",
      sortOrder: 200,
    },
    {
      name: "page_intent_proposer",
      label: "Destination proposer",
      description:
        "Proposes where each mapped page should go — keep, move, merge, redirect, rewrite or delete — from the Propose destinations control.",
      kind: "single",
      defaultAgentId: null,
      mandateKey: "seo.page_intent_proposer",
      allowCustom: false,
      autoRun: "never",
      sortOrder: 210,
    },
  ],
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
