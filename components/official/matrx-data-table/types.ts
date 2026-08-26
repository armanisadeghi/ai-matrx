import type { ReactNode } from "react";
import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import type {
  AiCustomSource,
  AiVariant,
} from "@/components/agent-copy/AiCopyMenu";
import type { LayeredFilterField, LayeredFilterRule } from "./layered-filters";

/** How a column's filter UI behaves. `auto` infers from sample values. */
export type ColumnFilterKind =
  "auto" | "text" | "select" | "boolean" | "number" | false;

export type SortDirection = "asc" | "desc";

/** How the table's primary search text is matched. */
export type TableSearchMatchMode = "contains" | "whole_words";

/** Cell value type for typed inline editors (Supabase-style popovers for non-strings). */
export type CellEditType =
  | "string"
  | "number"
  | "boolean"
  | "select"
  /** Free-text multi-value chips (string[] cells: tags, labels, aliases). */
  | "tags"
  | "date"
  | false;

export interface MatrxColumnDef<T> {
  /** Stable id used for sort/filter state. Defaults to `accessorKey` when set. */
  id?: string;
  /** Dot-free key on the row for default value access + auto filter. */
  accessorKey?: keyof T & string;
  /** Custom value for sort/filter when `accessorKey` is insufficient. */
  accessorFn?: (row: T) => unknown;
  header: ReactNode;
  /** Cell renderer. Defaults to stringified accessor value. */
  cell?: (row: T, index: number) => ReactNode;
  /** Sortable unless explicitly false. Default true. */
  sortable?: boolean;
  /**
   * Filter kind. Default `"auto"` — every column gets a filter.
   * Pass `false` only when a column truly must not filter (e.g. actions).
   */
  filter?: ColumnFilterKind;
  /** Explicit select options (when filter is `"select"` or auto-detected). */
  filterOptions?: Array<{ value: string; label: string }>;
  /**
   * Single-choice select filter. The default select filter is a multi-select
   * that APPENDS (OR semantics) — correct for a status column, wrong for a
   * column whose options are mutually exclusive VIEWS of the list (a
   * record-class scope, a relative-date bucket). There, appending makes the
   * filter inert: the consumer reads one value, the popover accumulates a set,
   * and the first-selected value wins forever (D218). With `filterSingle`,
   * choosing an option REPLACES the selection, and choosing the active option
   * again clears it.
   */
  filterSingle?: boolean;
  /**
   * Inline edit. Default false. `"string"` edits in-cell; other types open a
   * small popover (Supabase-style). Edits stay local until Save on the dirty pill.
   */
  editable?: CellEditType;
  /**
   * Per-row edit gate for an `editable` column. Return false to render the
   * plain cell (no pencil, no click-to-edit) for that row — for heterogeneous
   * lists where some kinds cannot take the write (e.g. a transcripts row of
   * kind "unsorted" has no user-facing title). Default: every row editable.
   */
  editableIf?: (row: T) => boolean;
  /**
   * How inline edit starts. Default `"click"` (click the cell body). `"pencil"`
   * shows a hover/focus pencil; the cell body no longer starts edit — so a
   * whole-row click can own that gesture. Forced to `"pencil"` when `href` is
   * set (D112 — the body is a real link).
   */
  editTrigger?: "click" | "pencil";
  /**
   * Options when `editable === "select"`. Also used by `"tags"` as the
   * suggestion list (existing values), while still allowing new entries.
   */
  editOptions?: Array<{ value: string; label: string }>;
  /**
   * Row link for the primary/title cell (D112): renders the cell content as a
   * real `next/link` anchor, so the row is reachable by keyboard, announced as
   * a link by screen readers, and cmd/middle-clickable into a new tab. The
   * whole-row `onRowOpen` click stays as a mouse convenience; clicks on the
   * anchor never double-fire it. Combine with `editable` and the link renders
   * with a hover/focus pencil that opens the inline editor instead of
   * click-text-to-edit.
   */
  href?: (row: T) => string | undefined;
  /**
   * Canonical entity token for the record this column NAMES. When set, the cell
   * renders through `EntityRef`, so the name carries the full door set — Open,
   * new tab, and Peek — instead of the Open-only `<Link>` that `href` alone
   * produces.
   *
   * THE INVENTORY LAW, applied to this component: the table grew its own door
   * (`href`) beside the platform's (`EntityRef`), and every column that named a
   * record picked one and silently lost the other half. This field collapses
   * them — `href` still works and still forces the pencil trigger, and it
   * OVERRIDES the registry route when both are set (for an admin-side route on
   * a satellite deployment).
   *
   * Needs the record's id: `entityToken` is paired with `entityId`, defaulting
   * to the table's own `getRowId`.
   *
   * **PER ROW, not per column** — a hub can be heterogeneous. `/transcripts`
   * lists transcripts, studio sessions, cleanup runs and an "unsorted" bucket
   * in one table, each with its own destination; a constant token would have
   * sent a session id to the transcript processor route and opened the
   * transcript peek on a record that is not one. Return `undefined` for a row
   * that names no entity — it falls back to the plain `href` link, or to inert
   * text. Pair with a per-row `href` when the kinds diverge.
   */
  entityToken?: string | ((row: T) => string | undefined);
  /**
   * NOTE: give the column a `cell` when you set this. Without one, a
   * UUID-shaped value renders the default `MatrxUuidCell`, which has its own
   * controls — wrapping those in the door's anchor would nest interactive
   * elements inside a link, and is redundant besides. The shell detects that
   * combination, skips the door, and screams once per column.
   */
  /** The id `entityToken` refers to. Defaults to the table's `getRowId(row)`. */
  entityId?: (row: T) => string | undefined;
  /**
   * Drop this column below `sm` (the phone breakpoint).
   *
   * A wide table on a phone becomes a horizontal scroller: the frozen
   * identity column stays, and everything after the second column sits off
   * the right edge where a reviewer will never find it. Marking the columns
   * that do NOT earn their width on a phone is how a surface declares an
   * INTENTIONAL mobile column set instead of an accidental one.
   *
   * The column is still fully sortable/filterable from the toolbar and still
   * rides every copy/export payload — this hides the CELL, not the data.
   * Default `false` = today's behavior everywhere.
   */
  mobileHidden?: boolean;
  /**
   * Built-in cell kinds. `"uuid"` / `"fk"` use MatrxUuidCell (short + copy +
   * optional open). `"auto"` (default) detects UUID-shaped strings.
   */
  cellKind?: "auto" | "uuid" | "fk" | "text";
  /**
   * FK / UUID navigation. Prefer `onOpen` → WindowPanel of the target.
   * Return `"forbidden"` when the caller lacks access.
   */
  fk?: {
    label?: string;
    /**
     * Canonical entity token this column's ids point at (`agent`, `note`, …).
     * THE DOOR LAW made declarative: the cell resolves route + new tab + peek
     * from the registries, so a column of ids stops being a dead end without
     * hand-wiring a link. `href` / `onOpen` still win when both are set.
     * A function form resolves the token per row (an audit log whose target
     * type varies by row).
     *
     * `"auto"` derives the token from the COLUMN NAME (`task_id` → `task`).
     * It is opt-in on purpose: the guess is only correct when you have checked
     * the actual FK. `scheduler.sch_run.task_id` references `scheduler.sch_task`,
     * not the workspace `task` the name implies, and `app_id` /
     * `conversation_id` / `file_id` / `workflow_id` each have several candidate
     * tables. A wrong door opens a DIFFERENT record — worse than no door.
     */
    token?: string | null | "auto" | ((row: T) => string | null | undefined);
    href?: (id: string, row: T) => string | null | undefined;
    onOpen?: (
      id: string,
      row: T,
    ) => void | "forbidden" | Promise<void | "forbidden">;
    /** Force non-navigable for this column. */
    forbidden?: boolean | ((id: string, row: T) => boolean);
  };
  className?: string;
  headerClassName?: string;
  width?: string | number;
  align?: "left" | "center" | "right";
  /**
   * ICON COLUMN. A column whose whole content is one glyph — a star, a lock, a
   * status dot — and whose `width` is therefore a lie without this flag.
   *
   * `width` is only a hint on a table cell: min-content wins. A 40px star column
   * still rendered ~70px wide because the HEADER carried three separate
   * controls beside the glyph (the sort button, its arrow, the filter funnel),
   * and the cell carried the default `px-2` on both sides. Every surface that
   * wanted a tight icon column was paying for chrome it never used.
   *
   * `compact` fixes it AT THE PRIMITIVE, and does NOT cost the column anything:
   * horizontal padding drops to `px-1`, and the header collapses its three
   * controls into ONE popover trigger that still offers Sort ascending / Sort
   * descending / Clear sort / the full filter body. The column stays fully
   * sortable and filterable — the affordances moved into the menu, they did not
   * disappear. Active sort/filter still show, as a 2px dot on the trigger.
   *
   * Pair it with `width` and `align: "center"`.
   */
  compact?: boolean;
  /** Hide from the table (still available in column picker when we add it). */
  hidden?: boolean;
}

/** How a text filter matches. Default `"contains"`. */
export type TextFilterMode = "contains" | "empty" | "not_empty";

/** Active per-column filter value. Shape depends on filter kind. */
export type ColumnFilterValue =
  | { kind: "text"; value: string; mode?: TextFilterMode }
  | {
      kind: "select";
      /** Single-choice value (legacy writers). Ignored when `values` is set. */
      value: string;
      /** Multi-choice OR set — a row passes if it matches ANY entry. */
      values?: string[];
    }
  | { kind: "boolean"; value: boolean }
  | { kind: "number"; min?: number; max?: number };

export type ColumnFiltersState = Record<string, ColumnFilterValue | undefined>;

export interface SortState {
  id: string;
  direction: SortDirection;
}

/**
 * Opt-in durable URL state for a local table.
 *
 * Every table gets an explicit stable id, producing namespaced parameters such
 * as `table.accounts.q` and `table.accounts.sort`. This prevents collisions
 * with page-owned parameters and with sibling tables on the same route.
 */
export interface MatrxDataTableUrlStateConfig {
  /** Stable lowercase identifier: letters, numbers, and hyphens; max 64 chars. */
  id: string;
  /** Initial sort when the URL carries none. Default: none. */
  defaultSort?: SortState | null;
  /** Browser history behavior for table transitions. Default: `push`. */
  history?: "push" | "replace";
  /**
   * History behavior while typing search/any-of text. `session` pushes the
   * first edit, then replaces rapid keystrokes. Default: `session`.
   */
  textHistory?: "session" | "push" | "replace";
  /** Persist the open side-panel row. Default true. */
  selectedRow?: boolean;
  /** Persist the open table-owned window row. Default true. */
  windowRow?: boolean;
  /** Persist checkbox selection. Opt-in because large selections lengthen URLs. */
  selection?: boolean;
}

/**
 * Complete view state for a remotely queried table page. The table owns none
 * of this state in controlled mode: callers may mirror it to URL search params
 * and use it as part of a direct database-query cache key.
 */
export interface MatrxDataTableQueryState {
  /** One-based page number, matching the table's pagination UI. */
  page: number;
  pageSize: number;
  search: string;
  /** Defaults to `contains` when omitted, preserving every existing table. */
  searchMatchMode?: TableSearchMatchMode;
  anyOf: string;
  /** Ordered AND rules from the compact advanced-filter builder. */
  layeredFilters?: LayeredFilterRule[];
  columnFilters: ColumnFiltersState;
  sort: SortState | null;
}

/**
 * Optional data-processing contract. Omit it (or use `local`) to preserve the
 * original in-memory filter/sort/pagination behavior. In controlled mode,
 * `data` is already the current page and the caller performs all querying.
 */
export type MatrxDataTableQueryControl =
  | { mode: "local" }
  | {
      /** Local rows, but every query control is owned by the caller (for URL state). */
      mode: "controlled-local";
      state: MatrxDataTableQueryState;
      onStateChange: (next: MatrxDataTableQueryState) => void;
    }
  | {
      mode: "controlled";
      state: MatrxDataTableQueryState;
      /** Total rows matching the controlled query, not just `data.length`. */
      totalItems: number;
      onStateChange: (next: MatrxDataTableQueryState) => void;
    };

/**
 * Toolbar facets — first-class, Mars-extensible filter controls above the grid.
 * Start with button-group; add radio / switch / complex later without forking.
 */
export type ToolbarFacet =
  | {
      type: "button-group";
      id: string;
      label?: string;
      value: string;
      /** Reset target for per-facet + global clear. Default: first option value. */
      defaultValue?: string;
      options: Array<{
        value: string;
        label: string;
        icon?: ReactNode;
      }>;
      onChange: (value: string) => void;
    }
  | {
      type: "custom";
      id: string;
      render: () => ReactNode;
    };

/**
 * Cross-column OR search — matches if ANY listed column contains the query.
 * Relationships use case: filter by entity type without picking source vs target.
 */
export interface AnyOfColumnSearch {
  columnIds: string[];
  placeholder?: string;
  /** Controlled value. Uncontrolled if omitted. */
  value?: string;
  onChange?: (value: string) => void;
}

export interface MatrxDataTableToolbar {
  /** Global search across all accessor values. Default true. */
  search?: boolean;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  /**
   * Show a compact, visible choice between substring and whole-word search.
   * Omit it when a data source cannot honor both modes server-side.
   */
  searchMatch?: {
    defaultMode?: TableSearchMatchMode;
  };
  /**
   * OR-search across specific columns (e.g. source_type OR target_type).
   * Shown as its own input beside global search when set.
   */
  anyOf?: AnyOfColumnSearch;
  /**
   * Optional compact advanced-filter builder beside the regular search. In
   * controlled mode rules live in `query.state.layeredFilters`; local tables
   * evaluate them against matching column ids.
   */
  layeredFilters?: {
    fields: readonly LayeredFilterField[];
    maxRules?: number;
    label?: string;
  };
  /** Extensible facet strip (button groups, later radios/switches/…). */
  facets?: ToolbarFacet[];
  /** Left-side extra nodes (after search / facets). */
  leading?: ReactNode;
  /** Right-side actions (create, refresh, …). */
  actions?: ReactNode;
}

export interface MatrxDataTableCopyConfig<T> {
  /** Toast / tooltip label base, e.g. "Relationship rule". */
  label: string;
  listLabel?: string;
  location: string;
  rowKind: string;
  listKind: string;
  rowDescription?: string;
  listDescription?: string;
  humanRow: (row: T) => string;
  /** Project row for agent JSON. Default: full row. */
  agentRow?: (row: T) => unknown;
  rowAttributes?: (
    row: T,
  ) => Record<string, string | number | boolean | null | undefined>;
  listAttributes?: (
    visible: T[],
    all: T[],
  ) => Record<string, string | number | boolean | null | undefined>;
  /**
   * Live view state rendered inside the list payload's <context>. Unlike
   * per-row data, this remains present when the current view has zero rows.
   */
  listContext?: (
    visible: T[],
    all: T[],
  ) => Record<string, string | number | boolean | null | undefined>;
  /**
   * Graded AI variants for the toolbar's view copy (e.g. "Top 25", "Summary
   * only"). When set, the toolbar's Copy-for-AI upgrades to a dropdown with
   * these variants + the full-view payload as the automatic "Everything"
   * escape hatch. Receives (visible, all) rows at render; builders run at
   * click time.
   */
  aiVariants?: (visible: T[], all: T[]) => AiVariant[];
  /** Custom-preview source (options dialog + live size counts) for the view. */
  aiCustom?: (visible: T[], all: T[]) => AiCustomSource;
  /** Show toolbar copy (this view). Default true when copy is set. */
  showToolbar?: boolean;
  /** Show per-row copy. Default true when copy is set. */
  showRow?: boolean;
}

export interface MatrxDataTableDetailConfig<T> {
  /** Side-panel title. Default: first string column or "Details". */
  title?: (row: T) => ReactNode;
  description?: (row: T) => ReactNode | undefined;
  /** Override the default key/value inspector. */
  render?: (row: T, controls: MatrxDataTableRecordControls) => ReactNode;
  /** Header actions inside the side panel. */
  headerActions?: (row: T) => ReactNode;
  defaultWidth?: number;
  enabled?: boolean;
  /**
   * Maps a field name to the entity token its id points at, turning that field
   * into a door (route + peek) in the default inspector — side panel AND row
   * window.
   *
   * There is no default guess: this inspector renders whatever columns the row
   * has, and a wrong door opens a DIFFERENT record (`sch_run.task_id` is a
   * SCHEDULED task, not a workspace `task`). A table whose FKs you HAVE checked
   * can pass `tokenFromColumnName` (`components/official/entity-ref/doors`) to
   * open every `<token>_id` field at once.
   *
   * The ROW is passed too, because a table whose target type varies per row (an
   * audit log, an exposure report) cannot answer from the column name alone.
   */
  tokenForField?: (key: string, row: T) => string | null;
}

/** Actions a record-owned control can use without reaching into table state. */
export interface MatrxDataTableRecordControls {
  /** Close the row's side-panel detail, if open. */
  closeDetail: () => void;
  /** Open the row in the canonical adjustable side panel. */
  openDetail: () => void;
  /** Open the row in its canonical table-owned WindowPanel. */
  openWindow: () => void;
  /** Close the row's table-owned WindowPanel, if open. */
  closeWindow: () => void;
}

export interface MatrxDataTableWindowConfig<T> {
  /** Window title. */
  title?: (row: T) => string;
  /**
   * @deprecated Prefer `renderView` + `renderEdit` so the window stays editable.
   * Full-body override with no View/Edit tabs.
   */
  render?: (row: T, controls: MatrxDataTableRecordControls) => ReactNode;
  /** View tab body. Defaults to DataRowInspector. */
  renderView?: (row: T, controls: MatrxDataTableRecordControls) => ReactNode;
  /**
   * Edit tab body. When set, the WindowPanel shows View / Edit sidebar tabs
   * (WindowPanel built-in sidebar). Defaults to `detail.render` when present.
   * Pass `false` to keep a view-only window even when `detail.render` exists.
   */
  renderEdit?:
    ((row: T, controls: MatrxDataTableRecordControls) => ReactNode) | false;
  /**
   * Called when the panel icon opens the window — hydrate edit state here
   * without opening the side panel (prefer this over `onRowOpen` for windows).
   */
  onOpen?: (row: T) => void;
  /**
   * Make full-row click open the WindowPanel instead of the side panel.
   * The trailing row action and the window header then expose the side panel
   * as the explicit secondary presentation. Default false.
   */
  openOnRowClick?: boolean;
  /** Which tab to open. Default: `"edit"` when an edit body exists. */
  defaultTab?: "view" | "edit";
  /** Show the panel-icon that opens the window. Default true when detail enabled. */
  enabled?: boolean;
  width?: number;
  height?: number;
}

export interface MatrxDataTableEmptyState {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

/** Pending cell edits keyed by row id → partial field map. */
export type CellEditsMap = Record<string, Record<string, unknown>>;

export interface MatrxDataTableEditConfig<T> {
  /** Enable inline editing for columns with `editable` set. */
  enabled?: boolean;
  /**
   * Persist all pending edits. Called when the user clicks Save on the dirty pill.
   * Return resolved when done; throw/reject to keep the draft (with toast).
   */
  onSave: (edits: CellEditsMap, rows: T[]) => void | Promise<void>;
  /** Persist each committed cell immediately. Failed writes remain in the
   * dirty pill so the user can retry or cancel them. */
  autoSave?: boolean;
  /** Optional cancel hook (draft already discarded). */
  onCancel?: () => void;
}

export interface MatrxDataTableHierarchyConfig<T> {
  /** Complete hierarchy when `data` is only the current controlled page. */
  rows?: T[];
  getParentId: (row: T) => string | null;
  /** Persist the exact structural intent represented by the drop shadow. */
  onMove: (row: T, move: MatrxDataTableHierarchyMove) => void | Promise<void>;
  /** Enables sibling insertion shadows in addition to parent/root drops. */
  manualOrder?: boolean;
  canReparent?: (row: T) => boolean;
  itemLabel?: (row: T) => string;
  rootDropLabel?: string;
}

export interface MatrxDataTableHierarchyMove {
  parentId: string | null;
  /** Insert immediately before this sibling. Null means first/only child. */
  beforeId: string | null;
  position: "before" | "inside" | "root";
  targetId: string | null;
}

/**
 * Multi-row selection — a leading checkbox column plus a bulk bar that appears
 * only while rows are checked.
 *
 * OPT-IN and fully CONTROLLED: the consumer owns the id set, so selection
 * survives (or is deliberately cleared by) a re-fetch, a filter change, or an
 * optimistic list update — the table never holds hidden selection state that
 * can disagree with the surface around it.
 *
 * Why this is a primitive and not a per-surface checkbox column: a register
 * the user cannot clear in bulk is a register they stop reading, and the fifth
 * hand-rolled selection column — each with its own shift-click, its own
 * select-all semantics, its own bar — is exactly the fork `components/official/`
 * exists to prevent.
 *
 * Selection turns OFF the mobile frozen-identity-column treatment: two sticky
 * leading cells would overlap, and a frozen checkbox identifies nothing.
 * Horizontal scrolling is unchanged.
 */
export interface MatrxDataTableSelectionConfig<T> {
  /** Selected row ids (`getRowId`). Ids not on the current page are kept. */
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  /**
   * The bulk bar's actions, given the currently-selected rows THAT ARE LOADED.
   * Selection can outlive a page change, so also take `selectedIds` when an
   * action only needs ids.
   */
  actions?: (selected: T[], selectedIds: string[]) => ReactNode;
  /** Rows that cannot be acted on in bulk render a disabled checkbox. */
  isRowSelectable?: (row: T) => boolean;
  /** Singular noun for the bar's count ("finding" → "3 findings selected"). */
  noun?: string;
}

/** Table-owned state and actions exposed to an opt-in phone card renderer. */
export interface MatrxDataTableMobileCardControls {
  /** Whether this row is in the canonical selection set. */
  selected: boolean;
  /** Whether the consumer allows this row to be selected. */
  selectable: boolean;
  /** Update selection through the table's controlled/URL-backed contract. */
  onSelectedChange: (selected: boolean) => void;
  /**
   * The table's canonical per-row copy controls plus consumer row actions.
   * Render this instead of rebuilding either action path inside the card.
   */
  actions: ReactNode;
}

export interface MatrxDataTableProps<T> {
  data: T[];
  columns: MatrxColumnDef<T>[];
  getRowId: (row: T) => string;
  /**
   * Additional row identity included in local global search without becoming
   * a visible/sortable/filterable column. Use for canonical composite keys or
   * aliases whose displayed parts live in separate columns.
   *
   * Ignored in remote controlled mode, where the query owner applies search.
   */
  searchText?: (row: T) => string;
  /**
   * Hierarchy-aware local processing seam. The canonical table still owns the
   * toolbar, URL state, headers, pagination, editing, copy, and rendering; the
   * consumer only preserves domain ordering that a flat sort would destroy.
   *
   * The processor must honor every active query control in `state` and return
   * the complete filtered/sorted local result before pagination. It is ignored
   * in remote controlled mode, where `data` is already the queried page.
   */
  processLocalRows?: (rows: T[], state: MatrxDataTableQueryState) => T[];
  isLoading?: boolean;
  /**
   * Background refresh state. Unlike `isLoading`, this preserves rendered rows
   * and shows only the table's non-blocking refresh indicator.
   */
  isFetching?: boolean;
  /**
   * Controlled query state for direct remote data sources. The component never
   * fetches data itself; it only emits state changes to the caller.
   */
  query?: MatrxDataTableQueryControl;
  /**
   * Persist local query and record-view state in namespaced URL parameters.
   * This is intentionally opt-in and cannot be combined with controlled query
   * mode; remote tables use `useTableUrlState({ tableId })` in their query owner.
   */
  urlState?: MatrxDataTableUrlStateConfig;

  toolbar?: MatrxDataTableToolbar;
  /** Row click opens the side panel unless `window.openOnRowClick` is true. */
  detail?: MatrxDataTableDetailConfig<T>;
  /** Panel icon opens a WindowPanel (page-local; supports ReactNode override). */
  window?: MatrxDataTableWindowConfig<T>;
  /** Copy + Copy for AI (rows + this view). */
  copy?: MatrxDataTableCopyConfig<T>;
  /** Inline edit session with floating Save/Cancel pill. */
  edit?: MatrxDataTableEditConfig<T>;
  /** Opt-in tree reparenting owned by the canonical row renderer. */
  hierarchy?: MatrxDataTableHierarchyConfig<T>;

  /** Controlled selection (selected row id for highlight). */
  selectedId?: string | null;
  onSelectedIdChange?: (id: string | null) => void;

  /** Controlled table-owned window row (normally supplied by URL state). */
  windowRowId?: string | null;
  onWindowRowIdChange?: (id: string | null) => void;

  /** Opt-in multi-row checkbox selection + a bulk action bar. */
  selection?: MatrxDataTableSelectionConfig<T>;

  /** Extra row actions rendered in a trailing Actions column. */
  rowActions?: (row: T, controls: MatrxDataTableRecordControls) => ReactNode;
  /**
   * Wrap the whole `<tr>`. Return `children` unchanged for no-op.
   *
   * `rowActions` only reaches the actions CELL, so anything that must own the
   * entire row — a right-click menu, a drag handle, a drop target — had no
   * seam and would have forced a surface to fork the table. THE INVENTORY LAW:
   * the fork is the defect, so the seam exists instead.
   *
   * Whatever you return must render `children` as a direct `<tbody>` child, so
   * the wrapper has to be a component that emits the `<tr>` unchanged
   * (`ItemContextMenu` does — it renders a Radix trigger with `asChild`).
   */
  rowWrapper?: (row: T, children: ReactNode) => ReactNode;

  emptyState?: MatrxDataTableEmptyState;
  /** Default 25. Pass 0 to show all. */
  pageSize?: number;
  pageSizeOptions?: number[];
  zebra?: boolean;
  className?: string;
  tableClassName?: string;
  /**
   * Optional phone-only row presentation rendered below `sm` in place of the
   * horizontal table. The caller supplies the record summary because only the
   * product surface knows which values and actions are essential on a phone;
   * MatrxDataTable still owns query state, loading/empty states, and pagination.
   *
   * `controls.actions` carries the table-owned copy controls and consumer row
   * actions, so a card does not fork them. Desktop and tablet keep the canonical table. Prefer the default horizontal
   * table unless the product explicitly requires every essential value/action
   * to be discoverable without horizontal scrolling.
   */
  mobileCards?: (
    row: T,
    index: number,
    controls: MatrxDataTableMobileCardControls,
  ) => ReactNode;
  /**
   * Mobile (< sm) presentation. Default `"scroll"` — a deliberate horizontal
   * scroll surface: the table sizes to its content, the first (identity)
   * column freezes, and a right-edge fade + chevron affordance shows while
   * more columns sit off-screen. `"plain"` opts out of the frozen column and
   * the affordance (content-sized scrolling stays — wrapping every column at
   * 390px is never the right rendering). Zero-config for consumers.
   */
  mobile?: "scroll" | "plain";
  /** Called after a row is selected for detail (in addition to opening the panel). */
  onRowOpen?: (row: T) => void;
}

/** Re-export for callers building custom agent payloads. */
export type { AgentPayloadInput };
