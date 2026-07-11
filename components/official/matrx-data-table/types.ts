import type { ReactNode } from "react";

/** How a column's filter UI behaves. `auto` infers from sample values. */
export type ColumnFilterKind =
  "auto" | "text" | "select" | "boolean" | "number" | false;

export type SortDirection = "asc" | "desc";

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
 * Toolbar facets — first-class, Mars-extensible filter controls above the grid.
 * Start with button-group; add radio / switch / complex later without forking.
 */
export type ToolbarFacet =
  | {
      type: "button-group";
      id: string;
      label?: string;
      value: string;
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

export interface MatrxDataTableToolbar {
  /** Global search across all accessor values. Default true. */
  search?: boolean;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  /** Extensible facet strip (button groups, later radios/switches/…). */
  facets?: ToolbarFacet[];
  /** Left-side extra nodes (after search / facets). */
  leading?: ReactNode;
  /** Right-side actions (create, refresh, …). */
  actions?: ReactNode;
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
  /** Override the default key/value inspector in the WindowPanel. */
  render?: (row: T) => ReactNode;
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

export interface MatrxDataTableProps<T> {
  data: T[];
  columns: MatrxColumnDef<T>[];
  getRowId: (row: T) => string;
  isLoading?: boolean;

  toolbar?: MatrxDataTableToolbar;
  /** Row click opens the side panel (MatrxDynamicPanelHost via SidePanelSurface). */
  detail?: MatrxDataTableDetailConfig<T>;
  /** Panel icon opens a WindowPanel (page-local; supports ReactNode override). */
  window?: MatrxDataTableWindowConfig<T>;

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
