"use client";

// lib/entity-list/config.tsx
//
// THE config that turns the generic entity-list shell into a feature's list
// page. One `<EntityListPage config={...} />` per surface; the feature supplies
// its service functions, its column registry, its declared scopes, and its
// row-actions hook. Render props cover the genuinely bespoke parts (cards,
// compact rows, modals) — everything else is the shell's.
//
// Proven on /agents/all (features/agents/browse). Read that feature plus
// lib/list-scope/FEATURE.md before adding a knob here: a knob only earns its
// place when a SECOND surface needs it. Feature-specific fields are forbidden —
// that's what the render props are for.

import type { ReactNode } from "react";
import type { ListScopeKind } from "@/lib/list-scope/types";
import type { ListViewPrefs } from "@/lib/redux/preferences/userPreferencesSlice";
import type { ItemMenuConfig } from "@/components/official/item/types";
import type { ContextMenuEntityRef } from "@/features/context-menu-v3/types";
import type { SourceFeature } from "@/features/agents/types/instance.types";
import type {
  MatrxDataTableCopyConfig,
  MatrxDataTableMobileCardControls,
} from "@/components/official/matrx-data-table/types";
import type { EntityColumnSpec } from "./columns";
import type {
  EntityFacets,
  EntityFilters,
  EntityListPage as EntityListPageData,
  EntityListQuery,
  EntityListSort,
  EntityScopeCounts,
} from "./types";

/**
 * The three server calls every list surface makes, as functions rather than
 * RPC names: the feature owns its service module (typed against the generated
 * RPC returns) and the shell owns when to call it. Per-feature RPCs are
 * hand-written from the documented template — see lib/list-scope/FEATURE.md.
 */
export interface EntityListService<TRow> {
  fetchPage(
    query: EntityListQuery,
    sort: EntityListSort,
  ): Promise<EntityListPageData<TRow>>;
  fetchCounts(query: EntityListQuery): Promise<EntityScopeCounts>;
  fetchFacets(query: EntityListQuery): Promise<EntityFacets>;
}

/** What useEntityList hands back — the query half of the surface. */
export interface EntityListController<TRow> {
  query: EntityListQuery;
  rows: TRow[];
  total: number;
  counts: EntityScopeCounts;
  /** The counts query is in flight — distinct from the row query's loading. */
  countsLoading: boolean;
  /** The counts query's own failure, in the service's words. */
  countsError: string | null;
  facets: EntityFacets;
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;

  setScope: (scope: EntityListQuery["scope"]) => void;
  setFilters: (filters: EntityFilters) => void;
  setSearch: (search: string) => void;
  setDeep: (deep: boolean) => void;
  patchQuery: (patch: Partial<EntityListQuery>) => void;
  setPage: (page: number) => void;
  resetFilters: () => void;
  refresh: () => void;
  /** Drop a row locally after a confirmed delete — no full refetch flash. */
  removeRow: (id: string) => void;
  /** Patch a row locally after an optimistic edit (favorite, rename, archive). */
  patchRow: (id: string, patch: Partial<TRow>) => void;
}

/**
 * The behaviour half a feature wires onto rows. `menuFor` is the ONE action
 * list (kebab + right-click + cards + rows all consume it); `onOpenRow` is the
 * whole-row click; `onToggleFavorite` backs the interactive star.
 */
export interface EntityRowActions<TRow> {
  menuFor: (row: TRow) => () => ItemMenuConfig;
  onOpenRow: (row: TRow) => void;
  onToggleFavorite?: (row: TRow) => void;
}

/** What a feature's row-actions hook returns to the shell. */
export interface EntityRowActionsResult<TRow> {
  actions: EntityRowActions<TRow>;
  /** The feature's modals (action chooser, share, rename…). Singletons keyed
   *  by the row being acted on — never one modal per row. */
  modals?: ReactNode;
}

/** Props handed to the cards / compact-rows render props. */
export interface EntityAltViewProps<TRow> {
  rows: TRow[];
  density: ListViewPrefs["density"];
  /** True outside "Mine" — owner/org/access carry information there only. */
  showShared: boolean;
  actions: EntityRowActions<TRow>;
  /** Canonical Door Law route for a row, resolved by the list shell. */
  hrefFor: (row: TRow) => string | undefined;
}

export interface EntityFacetSection {
  /** Facet kind in the facets payload (e.g. "category", "tag"). */
  facet: string;
  /** Filter-bag key the selection writes to (e.g. "category", "tags"). */
  filterId: string;
  label: string;
  /** Label for the `__none__` sentinel ("Uncategorized", "Untagged"). */
  noneLabel: string;
  /** Hide the section until the facet has at least this many values. */
  minOptions?: number;
  /** Append the option count to the section label. Default true. */
  countInLabel?: boolean;
  /** Chip-search placeholder. Default derives from the label. */
  searchPlaceholder?: string;
  /**
   * Human label for one raw facet value. Same reason as
   * `EntityColumnSpec.formatFacetValue`, and a surface should pass the SAME
   * function to both so a chip and a column header never name one value twice.
   */
  formatValue?: (value: string) => string;
}

/**
 * A filter-panel section that narrows the SCOPE rather than the filter bag.
 *
 * 🚨 WHY THIS EXISTS (one-resolution FIX-R3/W1, 2026-09-08). A narrowable scope
 * — "My Orgs" with a per-org choice, "Industry" with a per-industry one —
 * carried its narrowing ONLY in a chevron dropdown welded to the tab. A walker
 * driving `/mandates` never found it, and reported the page as having no
 * per-organization view at all: the tab said "My Orgs" with one blended number,
 * and the whole point of that page is which organization a job is HOMED in.
 *
 * So the narrowing also appears where a person looks for narrowing — the
 * Filters panel — and it is THE SAME STATE, not a copy: this section reads and
 * writes `query.scope`, exactly as the tab's dropdown does. There is no second
 * filter to drift, and no client-side re-filtering of loaded rows: choosing an
 * option re-asks the surface's own service with that scope, which is the only
 * thing that decides ownership.
 *
 * The options and their counts come from the SAME counts query the tab uses
 * (`EntityScopeCounts.narrow`), so a number here and a number on the tab can
 * never disagree. Generic on purpose — every surface with a narrowable scope
 * inherits it.
 */
export interface EntityScopeFacetSection {
  /** Which scope kind this narrows. Rendered only while that scope is active. */
  scope: ListScopeKind;
  label: string;
  /** The un-narrowed choice ("All homes") — never left unnamed. */
  allLabel: string;
  /** One sentence saying what choosing one of these actually changes. */
  hint?: string;
}

export interface EntityListConfig<TRow> {
  /** Stable id for prefs storage. One key per list surface, never reused. */
  surfaceKey: string;
  /** "agent" / "agents" — search placeholder, toasts, empty states. */
  entityLabel: { singular: string; plural: string };
  /**
   * Which scopes this surface supports, in display order. It cannot invent one
   * of its own — see lib/list-scope/types.ts.
   *
   * A scope that is CONDITIONAL on who is looking (`system` is Matrx-admin
   * only) is not declared here: the config is a module constant and cannot read
   * auth state. The page passes the resolved list via `EntityListPage`'s
   * `scopes` prop, which wins over this.
   */
  scopes: ListScopeKind[];
  service: EntityListService<TRow>;
  /**
   * A string identifying what THIS service instance was built from. Changes
   * when the service's own inputs change (the caller's organizations landing,
   * an active workspace switching), so the shell re-asks instead of keeping the
   * answer it got from the empty first render. Full reasoning:
   * `useEntityList`'s `serviceKey`.
   *
   * A module-constant service needs none. A service built inside a component
   * from asynchronously-loaded data MUST declare one.
   */
  serviceKey?: string;
  columns: EntityColumnSpec<TRow>[];
  /**
   * Bump when `columns` gains or loses a column, so existing users get the new
   * default column set instead of silently keeping every new column ON.
   */
  prefsVersion: number;
  getRowId: (row: TRow) => string;
  /** Human name for a row — aria labels ("Actions for X"). */
  getRowName: (row: TRow) => string;
  /** Canonical Door Law configuration for the record-name cell. */
  door?: {
    token?: string | ((row: TRow) => string | null | undefined);
    column?: string;
    hrefFor?: (row: TRow) => string | undefined;
  };
  /**
   * Which feature mounted this list. Forwarded to the row's right-click menu,
   * which attributes every shortcut and agent launched from it. Required
   * because `SourceFeature` is a closed registry with no generic member —
   * `ItemContextMenu` used to hardcode `"files"` for every caller, and a
   * confident wrong answer is worse than being made to give the right one.
   */
  sourceFeature: SourceFeature;
  /**
   * What a row IS, for the right-click menu. Present → **Attach To**; with a
   * `resourceType` → **Share** as well. Both were dark on every list row until
   * this slot existed, not because the capability was missing but because
   * nothing forwarded an entity into it.
   *
   * Return `undefined` for a row that has no registered entity (a
   * heterogeneous hub's non-entity kinds) — never fabricate a token, which
   * would offer to attach a record that does not exist under that name.
   */
  getRowEntity?: (row: TRow) => ContextMenuEntityRef | undefined;
  /** Surface-specific style defaults beyond version/hiddenColumns. */
  prefsDefaults?: Partial<ListViewPrefs>;

  /**
   * The surface's HONEST default narrowing — where an untouched page starts and
   * where "Clear filters" returns to.
   *
   * This exists because a corpus is not always the list. `/work/conversations`
   * holds ~4,613 `conversation_type='subagent'` internal machine runs; showing
   * them by default buries every conversation a person had. Declaring the
   * default as a real, visible, clearable entry in the filter bag keeps THE
   * DOOR LAW intact — the rows are one click away with their true count in the
   * facet — where a hidden SQL predicate would be a silent lie.
   *
   * Generic on purpose: any surface whose corpus contains a machine-generated
   * majority has the same problem.
   */
  defaultFilters?: EntityFilters;

  /**
   * Put the query in the URL: scope, search, filters, archived, deep, page,
   * plus sort/direction. Off by default so existing surfaces are untouched.
   *
   * On, the URL is the source of truth — refresh, a pasted link and browser
   * Back/Forward all reproduce the list. Encoding lives in ./urlQuery.ts over
   * the canonical `lib/url-state` primitive; STYLE still persists through
   * `useListViewPrefs`, with the URL winning for the one style axis (sort) that
   * a shared link has to carry.
   */
  urlState?: boolean;

  /**
   * The feature's row-actions hook. Called by the shell as a hook (top level,
   * unconditionally) with the live list controller, so actions can patch rows
   * optimistically and refresh after mutations.
   */
  useRowActions: (
    list: EntityListController<TRow>,
  ) => EntityRowActionsResult<TRow>;

  /** Favorite star wiring. Absent → no interactive favorite handling. */
  favorite?: {
    isFavorite: (row: TRow) => boolean;
    canToggle: (row: TRow) => boolean;
    /** Tooltip when canToggle is false. */
    disabledTitle?: string;
  };

  /** Inline table editing. Absent → the table is read-only. */
  edit?: {
    /** Persist one row's pending edits (1-4 scalar fields). Receives the full
     *  row so heterogeneous surfaces can route the write by kind. */
    save: (row: TRow, edit: Partial<TRow>) => Promise<void>;
  };

  /** Deep-search toggle beside the search box. Absent → no toggle. */
  deepSearch?: { label: string };

  /**
   * Whether this surface has an archived axis (an `is_archived` flag its RPC
   * honors). Default true. False hides the panel's Archived section and the
   * query's `archived` field stays at its "active" default.
   */
  supportsArchived?: boolean;

  /** Facet-chip sections for the Filters & Sort panel, in display order. */
  facetSections: EntityFacetSection[];

  /**
   * Scope-narrowing sections for the Filters & Sort panel, above the facets.
   * Absent → the tab's own dropdown is the only place the scope narrows.
   */
  scopeSections?: EntityScopeFacetSection[];

  /** `__none__` display labels per column id, for table filter options. */
  noneLabels?: Record<string, string>;

  /** Copy / Copy-for-AI config, forwarded to MatrxDataTable. */
  copy?: MatrxDataTableCopyConfig<TRow>;

  /**
   * Optional phone-only rendering for the table view. The canonical table
   * still owns the loaded page, pagination, copy controls, and row actions;
   * the feature supplies only the compact record summary its users need.
   */
  mobileCards?: (
    row: TRow,
    index: number,
    controls: MatrxDataTableMobileCardControls,
  ) => ReactNode;

  /** Alternate views. Absent view → its toggle is not offered. */
  views?: {
    cards?: (props: EntityAltViewProps<TRow>) => ReactNode;
    rows?: (props: EntityAltViewProps<TRow>) => ReactNode;
  };

  emptyState: { title: string; description: string };
}
