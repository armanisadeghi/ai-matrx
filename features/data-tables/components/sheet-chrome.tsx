"use client";

// features/data-tables/components/sheet-chrome.tsx — THE SHEET'S TOOLBAR SLOTS AND COLUMN HEADERS,
// EACH ITS OWN COMPILED COMPONENT (lane RENDER-3, 2026-09-27).
//
// Measured on /data-v2 (Hygiene Recall Schedule, a copied table that opens in the Sheet) after
// RENDER-2: one cell edit still rendered the toolbar 181 times and the column headers 291 times —
// once per Sheet render, three per edit — because `UserTableViewer` handed the toolbar four JSX
// slots rebuilt on every render (`viewControls`, `copyControls`, `mobileViewControls`,
// `moreActions`) and drew every header inline with fresh per-column closures. Here each slot is a
// component fed values that do not move on an edit (the Undo pair reads its own source), and each
// header cell is a component keyed by its column, fed plain values and ONE steady actions object —
// so a Sheet render that changed nothing a header shows redraws no header.

import { memo, useSyncExternalStore } from "react";
import type { SheetUndoSource } from "@/features/data-tables/components/sheet-body-row";
import { createPortal } from "react-dom";
import { KeyRound, Redo2, RotateCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { SavedViewBar } from "@/features/data-tables/saved-views/SavedViewBar";
import type { useSavedViews } from "@/features/data-tables/saved-views/useSavedViews";
import { ColumnViewMenu } from "@/features/data-tables/components/ColumnViewMenu";
import { TableLayoutMenu } from "@/features/data-tables/components/TableLayoutMenu";
import { TableCopyControls } from "@/features/data-tables/components/TableCopyControls";
import { OpenSurfaceMenuButton } from "@/features/context-menu-v3/components/OpenSurfaceMenuButton";
import { CellCleanupButton } from "@/components/content-cleanup/CellCleanupButton";
import type { CleanableRow, RowPatch } from "@/lib/content-cleanup/value-types";
import { effectiveLayoutMode, effectiveRowDensity, resolveTableLayout, resolveViewColumns } from "@/features/data-tables/table-view-url";
import type { useTableViewUrlState } from "@/features/data-tables/hooks/useTableViewUrlState";
import { GRID_FIELD_DOM_ATTR } from "@/features/data-tables/grid-context-menu";
import type { ColumnFilter } from "@/features/data-tables/column-filters";

/**
 * THE CHROME NAMES NO OLD MODULE (lane GUARDS-GREEN, 2026-09-27; `check:old-system-unreachable`).
 * This file holds the Sheet's toolbar slots and column headers; the Sheet that draws them
 * (`components/user-generated-table-data/UserTableViewer.tsx`) is the older half of the Data tables
 * screen and brings its own older parts: it wraps its toolbar in `memo` itself and hands its
 * column menu to `SheetHeaderCell` as `menu`. So the only place that reaches the old modules is
 * the Sheet, already in the census, and this file names none of them.
 */
/** The column facts the chrome reads (the Sheet's own field rows carry these and more). */
export interface SheetField {
  field_name: string;
  display_name: string;
  data_type: string;
  field_order: number;
}
/** What `SheetHeaderCell` hands the column menu the Sheet gives it. */
export interface SheetColumnMenuProps {
  tableId?: string;
  fieldName: string;
  displayName: string;
  dataType: string;
  isSorted: boolean;
  sortDirection: "asc" | "desc";
  filter: ColumnFilter | undefined;
  searchTerm?: string;
  readLocalRows?: () => readonly { data?: Record<string, unknown> | null }[];
  totalCount: number;
  onSortAsc: () => void;
  onSortDesc: () => void;
  onClearSort: () => void;
  onFilterChange: (next: ColumnFilter | undefined) => void;
  onConfigure?: () => void;
  onRename?: () => void;
  labelForValue?: (value: string) => string;
  onInsert?: (side: "left" | "right") => void;
  onHide?: () => void;
  onUseAsRowLabel?: () => void;
  openRequest?: number;
  onDelete?: () => void;
}
export type SheetColumnMenu = React.ComponentType<SheetColumnMenuProps>;

type ViewUrl = ReturnType<typeof useTableViewUrlState>;
type SavedViews = ReturnType<typeof useSavedViews>;
type LayoutMenuProps = React.ComponentProps<typeof TableLayoutMenu>;
type CopyControlsProps = React.ComponentProps<typeof TableCopyControls>;

// ── Where the toolbar goes ──────────────────────────────────────────────────────────────────

/**
 * The toolbar in place, or in the table page's one toolbar row (`slot`); nothing while that row is
 * still mounting. A component rather than a call in the Sheet's render: handing the toolbar element
 * to `createPortal` there made the compiler treat it as mutated, so it was rebuilt on every render.
 */
export function SheetInPageRow({ slot, children }: { slot: HTMLElement | null | undefined; children: React.ReactNode }) {
  if (slot === undefined) return <>{children}</>;
  return slot ? createPortal(children, slot) : null;
}

// ── The memo boundaries ────────────────────────────────────────────────────────────────────────

// The toolbar's memo boundary (`SheetToolbar`) lives in the Sheet, beside the toolbar it wraps.

// ── The Undo / Redo pair, reading its own source ──────────────────────────────────────────────

/** The pair beside the grid (a shortcut nobody can see is not a safety net for a non-technical user). */
export function SheetUndoControls({ source, readOnly, layout }: { source: SheetUndoSource; readOnly: boolean; layout: "row" | "sheet" }) {
  const face = useSyncExternalStore(source.subscribe, source.face, source.face);
  if (readOnly || !(face.canUndo || face.canRedo)) return null;
  if (layout === "sheet") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 justify-start gap-2 px-3 text-sm"
          disabled={!face.canUndo || face.busy}
          onClick={source.undo}
        >
          <Undo2 className="h-4 w-4" />
          Undo
          {face.depth > 1 ? <span className="tabular-nums text-muted-foreground">{face.depth}</span> : null}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 justify-start gap-2 px-3 text-sm"
          disabled={!face.canRedo || face.busy}
          onClick={source.redo}
        >
          <Redo2 className="h-4 w-4" />
          Redo
        </Button>
      </div>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs"
        disabled={!face.canUndo || face.busy}
        onClick={source.undo}
        title="Undo the last change — a cell, or everything one action changed (⌘Z)"
      >
        <Undo2 className="h-3.5 w-3.5" />
        Undo
        {face.depth > 1 && <span className="tabular-nums text-muted-foreground">{face.depth}</span>}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs"
        disabled={!face.canRedo || face.busy}
        onClick={source.redo}
        title="Redo (⇧⌘Z)"
      >
        <Redo2 className="h-3.5 w-3.5" />
        Redo
      </Button>
    </div>
  );
}

// ── The view controls (desktop row) and the phone sheet's copy of them ─────────────────────────

/** What the view controls do. Hand the viewer's steady handlers (`useSteadyHandlers`). */
export interface SheetViewActions {
  setHiddenColumns: ViewUrl["setHiddenColumns"];
  setColumnOrder: ViewUrl["setColumnOrder"];
  setLayoutMode: ViewUrl["setLayoutMode"];
  setRowDensity: ViewUrl["setRowDensity"];
  setFreezeFirstColumn: ViewUrl["setFreezeFirstColumn"];
  setWrapText: ViewUrl["setWrapText"];
  clearColumnWidths: ViewUrl["clearColumnWidths"];
  resetView: ViewUrl["resetView"];
  addColumnAtEnd: () => void;
  clearSort: () => void;
  saveDefaultSort: () => void;
  clearDefaultSort: () => void;
}

export interface SheetViewProps {
  savedViews: SavedViews;
  readOnly: boolean;
  fields: readonly SheetField[];
  hiddenColumns: ViewUrl["hiddenColumns"];
  columnOrder: ViewUrl["columnOrder"];
  layoutMode: ViewUrl["layoutMode"];
  rowDensity: ViewUrl["rowDensity"];
  defaultLayout: Parameters<typeof effectiveLayoutMode>[1];
  defaultRowHeight: Parameters<typeof effectiveRowDensity>[1];
  fitMaxColumns: number;
  freezeFirstColumn: boolean;
  wrapText: boolean;
  customWidthCount: number;
  viewCustomized: boolean;
  sortField: string | null;
  sortDirection: "asc" | "desc" | null | undefined;
  rowOrderingEnabled: boolean;
  savingSortPreference: boolean;
  sortSaved: boolean;
  savedSortField: string | null;
  undoSource: SheetUndoSource;
  act: SheetViewActions;
}

function useViewPieces(p: SheetViewProps) {
  const displayNameFor = (fieldName: string) => p.fields.find((f) => f.field_name === fieldName)?.display_name ?? fieldName;
  const menuFields = p.fields.map((f) => ({ field_name: f.field_name, display_name: f.display_name, field_order: f.field_order }));
  const customized =
    p.layoutMode !== "default" || p.rowDensity !== "default" || p.freezeFirstColumn || p.wrapText || p.customWidthCount > 0;
  // Worked out here from the view's own values (the same pure functions the Sheet uses), so the
  // Sheet hands this component nothing it re-derives on every render.
  const viewFieldCount = resolveViewColumns(p.fields, { hidden: p.hiddenColumns, order: p.columnOrder }).length;
  const layoutProps: LayoutMenuProps = {
    layoutMode: effectiveLayoutMode(p.layoutMode, p.defaultLayout),
    autoResolvesTo: resolveTableLayout("auto", viewFieldCount, p.fitMaxColumns),
    fitMaxColumns: p.fitMaxColumns,
    // Picking the organization's own default clears the personal override,
    // so the view stays "not customized" and follows the org if it changes.
    onLayoutModeChange: (next) => p.act.setLayoutMode(next === p.defaultLayout ? "default" : next),
    rowDensity: effectiveRowDensity(p.rowDensity, p.defaultRowHeight),
    onRowDensityChange: (next) => p.act.setRowDensity(next === p.defaultRowHeight ? "default" : next),
    isCustomized: customized,
    freezeFirstColumn: p.freezeFirstColumn,
    onFreezeFirstColumnChange: p.act.setFreezeFirstColumn,
    wrapText: p.wrapText,
    onWrapTextChange: p.act.setWrapText,
    customWidthCount: p.customWidthCount,
    onResetColumnWidths: p.act.clearColumnWidths,
  };
  const savedBar = (
    <SavedViewBar
      views={p.savedViews.views}
      loading={p.savedViews.loading}
      liveDefinition={p.savedViews.liveDefinition}
      activeViewId={p.savedViews.activeViewId}
      readOnly={p.readOnly}
      displayNameFor={displayNameFor}
      onApply={p.savedViews.apply}
      onClearActive={p.savedViews.clearActive}
      onSaveNew={p.savedViews.saveNew}
      onUpdate={p.savedViews.update}
      onRename={p.savedViews.rename}
      onSetDefault={p.savedViews.setDefault}
      onDelete={p.savedViews.remove}
    />
  );
  const columnMenu = (
    <ColumnViewMenu
      fields={menuFields}
      hidden={p.hiddenColumns}
      order={p.columnOrder}
      onHiddenChange={p.act.setHiddenColumns}
      onAddColumn={p.readOnly ? undefined : p.act.addColumnAtEnd}
      onOrderChange={p.act.setColumnOrder}
    />
  );
  const resetView = () => {
    p.act.resetView();
    // The bar must stop claiming a view is active — otherwise it
    // highlights a chip whose settings are no longer on screen.
    p.savedViews.clearActive();
  };
  return { savedBar, columnMenu, layoutProps, resetView, displayNameFor };
}

/** The desktop row's view controls: saved views, columns, layout, reset, undo. */
export function SheetViewControls(props: SheetViewProps) {
  const { savedBar, columnMenu, layoutProps, resetView } = useViewPieces(props);
  return (
    <>
      <div className="flex shrink-0 items-center [&>div]:flex-nowrap">{savedBar}</div>

      {/* Shown columns + order for THIS VIEW. Deliberately next to the
          grid rather than inside Table Settings: Table Settings edits the
          table for everyone, this edits only what you are looking at. */}
      <div className="flex shrink-0 items-center gap-1">
        {columnMenu}
        <TableLayoutMenu {...layoutProps} />
        {props.viewCustomized && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
            onClick={resetView}
            title="Clear search, sort, filters and column choices"
          >
            {/* An icon too, so the row's icons-alone fit (sheet-toolbar-fit.ts) keeps it a button. */}
            <RotateCcw className="h-3.5 w-3.5" />
            Reset view
          </Button>
        )}
      </div>

      {/* Undo lives beside the grid, not only on Cmd-Z. */}
      <SheetUndoControls source={props.undoSource} readOnly={props.readOnly} layout="row" />
    </>
  );
}

/** The phone's Tools sheet: the sort state, saved views, undo, columns, layout, reset. */
export function SheetMobileViewControls(props: SheetViewProps) {
  const { savedBar, columnMenu, layoutProps, resetView, displayNameFor } = useViewPieces(props);
  const { sortField, sortDirection, readOnly, rowOrderingEnabled, savingSortPreference, act } = props;
  const sortName = sortField ? displayNameFor(sortField) || sortField : "";
  return (
    <div className="space-y-2">
      {!sortField && rowOrderingEnabled ? (
        <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-sm" data-sort-mode="manual">
          <div className="flex min-h-11 items-center gap-2 text-muted-foreground">
            Sort: <span className="font-medium text-foreground">Manual</span>
            <span className="text-xs">· set by hand</span>
          </div>
        </div>
      ) : null}
      {sortField && !readOnly && rowOrderingEnabled ? (
        <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-sm">
          <div className="min-h-11 truncate py-2 text-muted-foreground">
            Sorted by <span className="font-medium text-foreground">{sortName}</span>{" "}
            {sortDirection === "asc" ? "↑" : "↓"} · hand-set order set aside
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" className="h-11 flex-1 text-xs" onClick={act.clearSort}>
              Back to manual
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 flex-1 text-xs text-primary"
              onClick={act.saveDefaultSort}
              disabled={savingSortPreference}
            >
              {savingSortPreference ? "Saving…" : "Use this sort instead"}
            </Button>
          </div>
        </div>
      ) : null}
      {sortField && !readOnly && !rowOrderingEnabled ? (
        <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-sm">
          <div className="flex min-h-11 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              Sorted by <span className="font-medium text-foreground">{sortName}</span>{" "}
              {sortDirection === "asc" ? "↑" : "↓"}
            </span>
            {props.sortSaved ? (
              <span className="flex shrink-0 items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Default
              </span>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-11 shrink-0 px-2 text-xs text-primary"
                onClick={act.saveDefaultSort}
                disabled={savingSortPreference}
              >
                {savingSortPreference ? "Saving…" : "Make default"}
              </Button>
            )}
          </div>
          {props.savedSortField ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 w-full justify-start px-2 text-xs text-muted-foreground"
              onClick={act.clearDefaultSort}
              disabled={savingSortPreference}
            >
              Clear default sort
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="[&_button]:min-h-11">{savedBar}</div>

      <SheetUndoControls source={props.undoSource} readOnly={readOnly} layout="sheet" />

      <div className="[&>button]:h-11 [&>button]:w-full [&>button]:justify-start [&>button]:px-2 [&>button]:text-sm">
        {columnMenu}
        <TableLayoutMenu {...layoutProps} />
      </div>

      {props.viewCustomized ? (
        <Button
          type="button"
          variant="ghost"
          className="h-11 w-full justify-start px-2 text-sm text-muted-foreground"
          onClick={resetView}
        >
          Reset search, sort, filters, and columns
        </Button>
      ) : null}
    </div>
  );
}

// ── Copy, cleanup and the ⋯ ────────────────────────────────────────────────────────────────────

/** The toolbar's copy controls; rows are read when a copy is asked for, never while drawing. */
export function SheetCopyControls(props: Omit<CopyControlsProps, "loadAllRows"> & { loadAllRows: CopyControlsProps["loadAllRows"] }) {
  return <TableCopyControls {...props} />;
}

/** The bulk cleanup control; it reads the page's rows when its popover opens (`readRows`). */
export function SheetCleanupControl({
  fields,
  readRows,
  loadAllRows,
  scopeLabel,
  onApply,
}: {
  fields: readonly SheetField[];
  readRows: () => readonly CleanableRow[];
  loadAllRows: () => Promise<CleanableRow[]>;
  scopeLabel: string;
  onApply: (patches: RowPatch[]) => Promise<void>;
}) {
  return (
    <CellCleanupButton
      fields={fields.map((f) => ({ fieldName: f.field_name, label: f.display_name }))}
      readRows={readRows}
      loadAllRows={loadAllRows}
      scopeLabel={scopeLabel}
      onApply={onApply}
    />
  );
}

/** The grid's ONE menu has a ⋯ (ALC-15): table-level, the same shell and rows right-click opens. */
export function SheetMoreActions({ getSurface }: { getSurface: () => HTMLElement | null }) {
  return <OpenSurfaceMenuButton getSurface={getSurface} label="More actions" className="h-11 w-11 md:h-7 md:w-7" />;
}

// ── One column header ──────────────────────────────────────────────────────────────────────────

/** What a header does. Hand the viewer's steady handlers (`useSteadyHandlers`). */
export interface SheetHeaderActions {
  selectColumn: (fieldName: string) => void;
  headerDragStart: (fieldName: string) => void;
  headerDragOver: (fieldName: string, side: "left" | "right") => void;
  headerDrop: (fieldName: string) => void;
  headerDragEnd: () => void;
  togglePageSelection: () => void;
  beginColumnResize: (e: React.MouseEvent<HTMLElement>, fieldName: string) => void;
  resetColumnWidth: (fieldName: string) => void;
  setRenameDraft: (value: string) => void;
  commitColumnRename: () => void;
  cancelColumnRename: () => void;
  handleSort: (fieldName: string, direction?: "asc" | "desc") => void;
  clearSort: () => void;
  handleColumnFilterChange: (fieldName: string, value: never) => void;
  startColumnRename: (fieldName: string) => void;
  insertColumnBeside: (fieldOrder: number, side: "left" | "right") => void;
  hideColumn: (fieldName: string) => void;
  makeRowLabelColumn: (fieldName: string) => void;
  configureColumn: (fieldName: string) => void;
  deleteColumn: (fieldName: string) => void;
  labelForValue: (fieldName: string, value: string) => string;
  readLocalRows: (fieldName: string) => readonly { data?: Record<string, unknown> | null }[];
}

/** Everything the Sheet's chrome does, as one steady object (`useSteadyLate`). */
export type SheetChromeActs = SheetHeaderActions &
  SheetViewActions & {
    readPageRows: () => readonly CleanableRow[];
    loadAllRowsForCopy: CopyControlsProps["loadAllRows"];
  };

export interface SheetHeaderCellProps {
  field: SheetField;
  /** The Sheet's column menu (a module-level component, so the memo holds). */
  menu: SheetColumnMenu;
  tableId: string;
  readOnly: boolean;
  mobile: boolean;
  sortDirection: "asc" | "desc" | null;
  filter: ColumnFilter | undefined;
  searchTerm: string;
  width: number | undefined;
  renaming: boolean;
  renameDraft: string;
  renameSaving: boolean;
  renameOpenedAt: number;
  dragging: boolean;
  dragFrom: boolean;
  dropSide: "left" | "right" | null;
  frozen: boolean;
  currentColumn: boolean;
  rowLabel: boolean;
  formula: boolean;
  totalCount: number;
  canHide: boolean;
  canDelete: boolean;
  openRequest: number;
  choiceLabels: boolean;
  act: SheetHeaderActions;
}

/**
 * ONE COLUMN HEADER. Every prop is a plain value or the steady `act`, so it is drawn again only
 * when something it shows changed — the boundary is the memo (the Sheet's row does the same,
 * `SheetBodyRow`); the body itself compiles.
 */
export const SheetHeaderCell = memo(function SheetHeaderCell(p: SheetHeaderCellProps) {
  const { field, act, menu: ColumnMenu } = p;
  const name = field.field_name;
  const style = p.width ? { width: p.width, minWidth: p.width, maxWidth: p.width } : undefined;
  return (
    <TableHead
      {...{ [GRID_FIELD_DOM_ATTR]: name }}
      data-surface-value="table_schema"
      // Clicking the header's own surface (not its sort label or its menu) selects the whole
      // column — the Excel and Sheets gesture. Ctrl/Cmd+Space does the same from the keyboard.
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        act.selectColumn(name);
      }}
      title={`Click to select the ${field.display_name} column`}
      // Drag to reorder (desktop). The resize handle cancels its own mousedown, so a drag can only
      // start from the header body; a header being renamed is not draggable.
      draggable={!p.mobile && !p.renaming}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", name);
        act.headerDragStart(name);
      }}
      onDragOver={(e) => {
        if (!p.dragging) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = e.currentTarget.getBoundingClientRect();
        act.headerDragOver(name, e.clientX < rect.left + rect.width / 2 ? "left" : "right");
      }}
      onDrop={(e) => {
        e.preventDefault();
        act.headerDrop(name);
      }}
      onDragEnd={act.headerDragEnd}
      style={style}
      className={cn(
        "sticky top-0 z-20 max-w-[70vw] border-b border-gray-200 bg-gray-100 py-1.5 font-semibold text-gray-700 transition-colors hover:bg-gray-200/70 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700/70 md:max-w-none",
        // The 150px floor is the platform's; a dragged width replaces it.
        !p.width && "md:min-w-[150px]",
        // Drop indicator while a header is being dragged over.
        p.dropSide !== null &&
          !p.dragFrom &&
          (p.dropSide === "left"
            ? "shadow-[inset_3px_0_0_theme(colors.primary.DEFAULT)]"
            : "shadow-[inset_-3px_0_0_theme(colors.primary.DEFAULT)]"),
        p.dragFrom && "opacity-50",
        // Frozen first column: sits right of the 2.5rem checkbox column and above scrolling neighbours.
        p.frozen &&
          "left-10 z-30 shadow-[inset_-1px_0_0_theme(colors.gray.200)] dark:shadow-[inset_-1px_0_0_theme(colors.gray.700)]",
      )}
    >
      {/* Drag handle on the right edge; double-click resets. */}
      {!p.mobile && (
        <span
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize the ${field.display_name} column`}
          title="Drag to resize · double-click to reset"
          onMouseDown={(e) => act.beginColumnResize(e, name)}
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            act.resetColumnWidth(name);
          }}
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize select-none hover:bg-primary/40 active:bg-primary/60"
        />
      )}
      <div data-surface-value="column_list" className="flex items-center justify-between gap-1">
        {p.renaming ? (
          <input
            autoFocus
            aria-label={`Rename the ${field.display_name} column`}
            value={p.renameDraft}
            disabled={p.renameSaving}
            onChange={(e) => act.setRenameDraft(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              // The grid owns arrow keys / typing; none of it may fire while a name is being typed.
              e.stopPropagation();
              if (e.key === "Enter") act.commitColumnRename();
              if (e.key === "Escape") act.cancelColumnRename();
            }}
            onBlur={(e) => {
              // A closing menu / popover hands focus back to its trigger a moment AFTER this input
              // mounts. That is not the user leaving the field — take focus back instead of ending
              // the rename they just asked for (live-found 2026-09-17).
              if (Date.now() - p.renameOpenedAt < 700) {
                const input = e.currentTarget;
                window.setTimeout(() => input.focus(), 0);
                return;
              }
              act.commitColumnRename();
            }}
            className="min-w-0 flex-1 rounded border border-primary bg-background px-1.5 py-0.5 text-sm font-semibold text-foreground outline-none ring-2 ring-primary/30"
          />
        ) : (
          <button
            type="button"
            data-surface-value={p.currentColumn ? "current_column_name" : undefined}
            onClick={() => act.handleSort(name)}
            className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5"
            title={`Sort by ${field.display_name}`}
          >
            {/* The row label: the column that names a row everywhere it is referred to (row-label.ts). */}
            {p.rowLabel && (
              <span title="Row label — rows of this table are called by this column">
                <KeyRound className="h-3 w-3 shrink-0 text-amber-600" aria-label="Row label column" />
              </span>
            )}
            <span className="truncate">{field.display_name}</span>
            {p.sortDirection !== null && <span className="flex-shrink-0">{p.sortDirection === "asc" ? "↑" : "↓"}</span>}
          </button>
        )}
        <ColumnMenu
          // A formula column has no stored value, so the server facet RPC would return nothing for
          // it. Omitting the table identity makes the menu work from the rows the browser holds
          // (with computed values) and say when that is not every row — its own honest fallback.
          tableId={p.formula ? undefined : p.tableId}
          fieldName={name}
          displayName={field.display_name}
          dataType={field.data_type}
          isSorted={p.sortDirection !== null}
          sortDirection={p.sortDirection ?? "asc"}
          filter={p.filter}
          searchTerm={p.searchTerm}
          // Rows the browser already holds, read when the menu OPENS (never while the header
          // draws, so a write to a cell does not redraw every header). The menu asks the server
          // only when these do not cover `totalCount`.
          readLocalRows={() => act.readLocalRows(name)}
          totalCount={p.totalCount}
          onSortAsc={() => act.handleSort(name, "asc")}
          onSortDesc={() => act.handleSort(name, "desc")}
          onClearSort={act.clearSort}
          onFilterChange={(value) => act.handleColumnFilterChange(name, value as never)}
          onRename={p.readOnly ? undefined : () => act.startColumnRename(name)}
          // A choice column's stored values may differ from what people read (a Person column
          // stores user ids) — the filter list shows the label, filters by the value.
          labelForValue={p.choiceLabels ? (value) => act.labelForValue(name, value) : undefined}
          // The same three doors the right-click Column section has — a column is managed from its
          // own header too.
          onInsert={p.readOnly ? undefined : (side) => act.insertColumnBeside(field.field_order, side)}
          onHide={p.canHide ? () => act.hideColumn(name) : undefined}
          onUseAsRowLabel={p.readOnly || p.rowLabel ? undefined : () => act.makeRowLabelColumn(name)}
          openRequest={p.openRequest}
          onConfigure={p.readOnly ? undefined : () => act.configureColumn(name)}
          onDelete={p.readOnly || !p.canDelete ? undefined : () => act.deleteColumn(name)}
        />
      </div>
    </TableHead>
  );
});
