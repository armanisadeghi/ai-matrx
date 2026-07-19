import type { ReactNode } from "react";
import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";

/** How a column's filter UI behaves. `auto` infers from sample values. */
export type ColumnFilterKind =
  "auto" | "text" | "select" | "boolean" | "number" | false;

export type SortDirection = "asc" | "desc";

/** Cell value type for typed inline editors (Supabase-style popovers for non-strings). */
export type CellEditType =
  "string" | "number" | "boolean" | "select" | "date" | false;

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
   * Inline edit. Default false. `"string"` edits in-cell; other types open a
   * small popover (Supabase-style). Edits stay local until Save on the dirty pill.
   */
  editable?: CellEditType;
  /** Options when `editable === "select"`. */
  editOptions?: Array<{ value: string; label: string }>;
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
  /** Hide from the table (still available in column picker when we add it). */
  hidden?: boolean;
}

/** Active per-column filter value. Shape depends on filter kind. */
export type ColumnFilterValue =
  | { kind: "text"; value: string }
  | { kind: "select"; value: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "number"; min?: number; max?: number };

export type ColumnFiltersState = Record<string, ColumnFilterValue | undefined>;

export interface SortState {
  id: string;
  direction: SortDirection;
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
  anyOf: string;
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
   * OR-search across specific columns (e.g. source_type OR target_type).
   * Shown as its own input beside global search when set.
   */
  anyOf?: AnyOfColumnSearch;
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
  render?: (row: T) => ReactNode;
  /** Header actions inside the side panel. */
  headerActions?: (row: T) => ReactNode;
  defaultWidth?: number;
  enabled?: boolean;
}

export interface MatrxDataTableWindowConfig<T> {
  /** Window title. */
  title?: (row: T) => string;
  /**
   * @deprecated Prefer `renderView` + `renderEdit` so the window stays editable.
   * Full-body override with no View/Edit tabs.
   */
  render?: (row: T) => ReactNode;
  /** View tab body. Defaults to DataRowInspector. */
  renderView?: (row: T) => ReactNode;
  /**
   * Edit tab body. When set, the WindowPanel shows View / Edit sidebar tabs
   * (WindowPanel built-in sidebar). Defaults to `detail.render` when present.
   * Pass `false` to keep a view-only window even when `detail.render` exists.
   */
  renderEdit?: ((row: T) => ReactNode) | false;
  /**
   * Called when the panel icon opens the window — hydrate edit state here
   * without opening the side panel (prefer this over `onRowOpen` for windows).
   */
  onOpen?: (row: T) => void;
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
  /** Optional cancel hook (draft already discarded). */
  onCancel?: () => void;
}

export interface MatrxDataTableProps<T> {
  data: T[];
  columns: MatrxColumnDef<T>[];
  getRowId: (row: T) => string;
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

  toolbar?: MatrxDataTableToolbar;
  /** Row click opens the side panel (MatrxDynamicPanelHost via SidePanelSurface). */
  detail?: MatrxDataTableDetailConfig<T>;
  /** Panel icon opens a WindowPanel (page-local; supports ReactNode override). */
  window?: MatrxDataTableWindowConfig<T>;
  /** Copy + Copy for AI (rows + this view). */
  copy?: MatrxDataTableCopyConfig<T>;
  /** Inline edit session with floating Save/Cancel pill. */
  edit?: MatrxDataTableEditConfig<T>;

  /** Controlled selection (selected row id for highlight). */
  selectedId?: string | null;
  onSelectedIdChange?: (id: string | null) => void;

  /** Extra row actions rendered in a trailing Actions column. */
  rowActions?: (row: T) => ReactNode;

  emptyState?: MatrxDataTableEmptyState;
  /** Default 25. Pass 0 to show all. */
  pageSize?: number;
  pageSizeOptions?: number[];
  zebra?: boolean;
  className?: string;
  tableClassName?: string;
  /** Called after a row is selected for detail (in addition to opening the panel). */
  onRowOpen?: (row: T) => void;
}

/** Re-export for callers building custom agent payloads. */
export type { AgentPayloadInput };
