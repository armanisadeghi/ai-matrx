// features/marketing/seo/topical-map/redux/types.ts
//
// The shapes the topical-map workspace slice holds. One entry per map, keyed by
// map id, because a user can have two maps open in two window panels and each
// keeps its own selection, expansion and view.
//
// WHY A NORMALIZED TREE. `seo.map_tree` returns a nested structure; every view
// (outline, table, graph, text) wants a different traversal of it and two of
// them want random access by slug. Storing the nesting would force each view to
// re-walk it, and an optimistic move would have to splice arrays. Slug is the
// agent-facing key (doctrine), so it is the key here too.

import type {
  MapTopicAssociation,
  MapTopicStatus,
  PageIntentDisposition,
  PageIntentRecord,
  PageIntentSource,
  PageIntentState,
} from "../types";

/** The four views of §2.1. Route segments under `…/map/[mapId]`. */
export type MapViewKey = "outline" | "table" | "graph" | "text";

export const MAP_VIEW_KEYS: readonly MapViewKey[] = [
  "outline",
  "table",
  "graph",
  "text",
] as const;

export function isMapViewKey(value: string): value is MapViewKey {
  return (MAP_VIEW_KEYS as readonly string[]).includes(value);
}

/**
 * One topic, flattened. Every optional field mirrors a `map_tree` `include`
 * key: absent means "not asked for", NEVER "zero" or "none". A view that shows
 * counts must ask for them; reading `pages ?? 0` on a tree loaded without
 * `counts` prints a confident lie.
 */
export interface NormalizedMapTopic {
  slug: string;
  name: string;
  description?: string | null;
  status?: MapTopicStatus | string;
  /** Null at the root. */
  parentSlug: string | null;
  /** In sort order. Empty when the topic has no children OR when the walk stopped here. */
  childSlugs: string[];
  /**
   * Present INSTEAD of a filled `childSlugs` when `map_tree`'s depth limit
   * stopped the walk at this topic. A view showing an expander must consult
   * this as well as `childSlugs.length`.
   */
  childrenCount?: number;
  pages?: number;
  planned?: number;
  keywords?: number;
  path?: string[];
  /** Facet key → value slug, as `map_tree` returned it (already includes inherited values). */
  facets?: Record<string, string>;
  associations?: MapTopicAssociation[];
  /** `seo.map_topic.layout` — set only once a row read has supplied it. */
  layout?: unknown;
  /** Depth from the root, computed at normalization time so views never re-walk. */
  depth: number;
}

/** What the workspace is currently narrowed to. Every field is "no filter" when null/empty. */
export interface MapTopicFilters {
  /** Substring, matched against name, slug and description client-side. */
  text: string;
  /** Topics whose status is in this set. Empty = every status the tree carried. */
  statuses: MapTopicStatus[];
  /** Facet key → value slug. A topic must match EVERY entry. */
  facets: Record<string, string>;
  /** Only topics that have at least one page / planned page. */
  onlyWithPages: boolean;
  /** Only topics with no live page and no planned page (the gap set). */
  onlyGaps: boolean;
}

export function emptyMapTopicFilters(): MapTopicFilters {
  return { text: "", statuses: [], facets: {}, onlyWithPages: false, onlyGaps: false };
}

/**
 * How siblings are ordered inside every view that walks the tree (CONTRACTS §3).
 *
 * `sort_order` is THE TREE'S OWN ORDER — the order `seo.map_tree` returned,
 * which is the order a person arranged their map in. It is the default for
 * that reason: every other value is a temporary lens over someone's structure,
 * never a replacement for it.
 *
 * The three count sorts (`pages`, `keywords`, `planned`) order DESCENDING and
 * put a topic whose count was never loaded LAST — not first, and never as a
 * zero. `map_tree` omits counts entirely when the tree was read without
 * `include: ["counts"]` (see {@link NormalizedMapTopic}), so treating absent as
 * 0 would sort a whole unloaded tree into a confident, wrong order.
 */
export type MapSiblingSort = "sort_order" | "name" | "pages" | "keywords" | "planned";

/**
 * What the pages workspace is narrowed to (CONTRACTS §3).
 *
 * Every field is "no filter" when null / "" / false, EXCEPT `traffic`, whose
 * "no filter" value is the explicit `"all"` — a tri-state that must never be
 * confused with "we have no traffic reading".
 */
export interface MapPageFilters {
  /** Substring, matched client-side against the page's title, url and summary. */
  text: string;
  /** Only pages whose intent or coverage names this topic. */
  topicSlug: string | null;
  /** Only pages in this region facet value. */
  regionSlug: string | null;
  /** `"low"` = clicks <= the `pages_low_traffic_clicks_max` knob. */
  traffic: "all" | "low" | "with_traffic";
  disposition: PageIntentDisposition | null;
  state: PageIntentState | null;
  source: PageIntentSource | null;
  /** The `list_pages_without_topic` tab. */
  onNoTopic: boolean;
}

export function emptyMapPageFilters(): MapPageFilters {
  return {
    text: "",
    topicSlug: null,
    regionSlug: null,
    traffic: "all",
    disposition: null,
    state: null,
    source: null,
    onNoTopic: false,
  };
}

/** The graph view's own state (CONTRACTS §3). */
export interface MapGraphState {
  /** The topic the graph is centred on. Null = the whole map. */
  focusSlug: string | null;
  /** What shape and colour encode: the tree, or where pages are converging. */
  encodingMode: "structure" | "convergence";
}

/** The table view's own state (CONTRACTS §3). */
export interface MapTableState {
  /** Rows keep their parent/child nesting rather than flattening. */
  hierarchy: boolean;
  /** Null = the `table_default_columns` knob's set, NEVER "no columns". */
  columns: string[] | null;
}

/**
 * Where a review deck left off. Two cursors, not one: a topic review and a
 * page-intent review run over different records and a user switching between
 * them must not lose either place.
 */
export interface MapReviewState {
  cursorSlug: string | null;
  cursorPageId: string | null;
}

/**
 * One in-flight optimistic write. `before` is the exact pre-edit state of the
 * touched topics; a rollback restores it byte for byte rather than re-deriving.
 */
export interface OptimisticEdit {
  opId: string;
  kind: "patch" | "move" | "layout";
  /** The slugs whose rows this edit changed. */
  slugs: string[];
  before: Record<string, NormalizedMapTopic>;
  /** Root order before the edit, restored when a move touched the root level. */
  beforeRootSlugs: string[] | null;
  startedAt: number;
}

/** What one open map holds. */
export interface TopicalMapWorkspaceState {
  mapId: string;
  topicsBySlug: Record<string, NormalizedMapTopic>;
  rootSlugs: string[];
  /** `map_tree`'s own count of the whole map, which can exceed the loaded rows. */
  totalTopics: number;
  /** Which `include` keys the loaded tree carried — so a view knows what is absent vs zero. */
  loadedIncludes: string[];
  loadedAt: string | null;
  selectedSlug: string | null;
  /** Multi-select for bulk actions (U2 table, U5). */
  checkedSlugs: string[];
  expandedSlugs: string[];
  view: MapViewKey;
  filters: MapTopicFilters;
  /** The site the counts and page-side reads are narrowed to. Null = every site the caller may view. */
  siteId: string | null;
  /** `map_graph(group_by)`. */
  groupBy: string | null;
  /** Page id → the one intent on that page, as `list_page_intents` returned it. */
  intentsByPageId: Record<string, PageIntentRecord>;
  /**
   * Page id → the slugs of the LIVE topics that page covers today, as
   * `list_page_intents` returned them. An entry holding `[]` is a page that is
   * ON NO TOPIC — a real state since round 22, and the reason this is stored
   * at all: `intentsByPageId` alone cannot tell "covers nothing" from "we
   * never listed this page", and a screen that guesses between those two is
   * the blank cell this round exists to kill.
   */
  coverageByPageId: Record<string, string[]>;
  /** Page id → the site it belongs to, so an intent can be written without a second read. */
  intentSiteByPageId: Record<string, string>;
  /** Non-zero means `list_page_intents` had to collapse duplicate edges — say so, never hide it. */
  duplicateIntents: number;
  optimistic: OptimisticEdit[];
  /** The pages workspace's filters (CONTRACTS §3). */
  pageFilters: MapPageFilters;
  /** Bulk selection of PAGES — deliberately separate from `checkedSlugs` (topics). */
  checkedPageIds: string[];
  graph: MapGraphState;
  table: MapTableState;
  review: MapReviewState;
  /** How siblings are ordered in every tree walk. */
  siblingSort: MapSiblingSort;
}

export interface TopicalMapSliceState {
  maps: Record<string, TopicalMapWorkspaceState>;
}

/** One row of the flattened, filtered, expansion-aware list every view renders. */
export interface VisibleMapTopic {
  slug: string;
  name: string;
  depth: number;
  /** True when the topic has children the user could reveal. */
  hasChildren: boolean;
  expanded: boolean;
  selected: boolean;
  checked: boolean;
  topic: NormalizedMapTopic;
}

/**
 * The intent state a view colors a page by (§2.7). A page is `leaving` the
 * topics it covers today and `arriving` at the one its intent names — which is
 * why both sides are carried here: one page is two different colors depending
 * on which topic's row is being drawn.
 */
export interface PageIntentView {
  pageId: string;
  disposition: PageIntentDisposition;
  state: PageIntentState;
  /**
   * Where the intent says the page belongs (or, for `delete`, where it sits
   * today) — NULL when that topic is no longer live.
   *
   * 🚨 ROUND 22. `seo.list_page_intents` keeps the intent and omits its
   * `topic` key while the topic is rejected or retired, so a destination that
   * left the map arrives here as null rather than as a slug no reader can
   * resolve. `pageTopicState` turns that into `intent_topic_hidden`.
   */
  intendedTopicSlug: string | null;
  /** Where its `covers` edges put it today. `[]` means it is on no topic. */
  currentTopicSlugs: string[];
}

/** How one topic's row should color one page. §2.7's vocabulary. */
export type PageIntentTone =
  | "in_place"
  | "leaving"
  | "arriving"
  | "delete"
  | "planned";

/**
 * Where ONE page stands in the map's topic structure, independent of any one
 * topic's row — the answer the plain page list and the bulk screen colour by.
 *
 * The first three keys are `intent_colors`' own (requirements §5: in_place
 * green, leaving amber, arriving blue), so a view reads the colour straight
 * off the knob. The last two are round 22's new honest states, and they have
 * NO `intent_colors` entry on purpose: they are not a disposition, they are
 * the absence of a live topic, which §5 draws with the `missing` gray-dashed
 * treatment.
 *
 * - `in_place` — it covers a live topic and nothing is moving it away.
 * - `leaving` — it covers live topics and its intent names a different one.
 * - `arriving` — it covers nothing live and its intent names a live topic.
 * - `on_no_topic` — no live coverage and no intent that resolves. Counted by
 *   `map_diagnostics.pages_on_no_topic`.
 * - `intent_topic_hidden` — an intent EXISTS and the topic it named has been
 *   rejected or retired, so the server no longer renders it. The decision is
 *   still true; the destination is gone, and the screen must say so.
 *
 * Disposition colour (`delete`, and the `planned` treatment of a `plan.node`)
 * stays with {@link PageIntentTone} / `pageIntentTone`: that answers "how
 * should THIS topic's row draw this page", which is a different question.
 */
export type PageTopicState =
  | "in_place"
  | "leaving"
  | "arriving"
  | "on_no_topic"
  | "intent_topic_hidden";

/**
 * The minimum a caller needs to answer {@link PageTopicState} for one page —
 * deliberately not {@link PageIntentView}, because a page with NO intent at
 * all still has a topic state and has no disposition to report.
 */
export interface PageTopicView {
  pageId: string;
  /** Live coverage today. `[]` is "on no topic", never "unknown". */
  currentTopicSlugs: string[];
  /** True when the page carries an intent edge at all. */
  hasIntent: boolean;
  /** The intent's destination, or null when it exists but its topic is hidden. */
  intendedTopicSlug: string | null;
}
