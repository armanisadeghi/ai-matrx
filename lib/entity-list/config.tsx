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
import type { MatrxDataTableCopyConfig } from "@/components/official/matrx-data-table/types";
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
}

export interface EntityListConfig<TRow> {
  /** Stable id for prefs storage. One key per list surface, never reused. */
  surfaceKey: string;
  /** "agent" / "agents" — search placeholder, toasts, empty states. */
  entityLabel: { singular: string; plural: string };
  /** Which of the fixed five scopes this surface supports, in display order.
   *  It cannot invent a sixth — see lib/list-scope/types.ts. */
  scopes: ListScopeKind[];
  service: EntityListService<TRow>;
  columns: EntityColumnSpec<TRow>[];
  /**
   * Bump when `columns` gains or loses a column, so existing users get the new
   * default column set instead of silently keeping every new column ON.
   */
  prefsVersion: number;
  getRowId: (row: TRow) => string;
  /** Human name for a row — aria labels ("Actions for X"). */
  getRowName: (row: TRow) => string;
  /** Surface-specific style defaults beyond version/hiddenColumns. */
  prefsDefaults?: Partial<ListViewPrefs>;

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

  /** `__none__` display labels per column id, for table filter options. */
  noneLabels?: Record<string, string>;

  /** Copy / Copy-for-AI config, forwarded to MatrxDataTable. */
  copy?: MatrxDataTableCopyConfig<TRow>;

  /** Alternate views. Absent view → its toggle is not offered. */
  views?: {
    cards?: (props: EntityAltViewProps<TRow>) => ReactNode;
    rows?: (props: EntityAltViewProps<TRow>) => ReactNode;
  };

  emptyState: { title: string; description: string };
}
