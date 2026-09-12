"use client";

/**
 * CopySubsetWindow — the "Filter & sort before copying…" overlay.
 *
 * A non-blocking WindowPanel holding the canonical `MatrxDataTable` over the
 * SESSION SNAPSHOT of the caller's rows (never the origin array): search,
 * per-column + layered filters, sort, pagination, checkbox selection; a
 * column chooser in the sidebar; a format switch, live counts, and a live
 * size estimate of the exact text the Copy button will write in the footer.
 *
 * Opened only through the overlay system (`features/overlays/openers/
 * copySubsetWindow.tsx`). The panel is bound with `onClose` (page-local),
 * never `overlayId`, so window persistence never restores a window whose
 * session is gone; a missing session renders an honest message + remedy.
 *
 * Nothing here mutates a row: the table never gets `edit`, and every shaping
 * step produces new arrays (`model.ts`).
 */

import { useEffect, useRef, useState } from "react";
import {
  Check,
  Columns3,
  Copy,
  Loader2,
  RotateCcw,
  Search,
} from "lucide-react";

import { CopyForAiIcon } from "@/components/agent-copy/CopyForAiIcon";
import { writeClipboard } from "@/components/agent-copy/clipboard";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import {
  getCellValue,
  stringifyCellValue,
} from "@ai-matrx/design-system/data-table/filter-engine";
import type { LayeredFilterField } from "@ai-matrx/design-system/data-table/layered-filters";
import type {
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@ai-matrx/design-system/data-table/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Input } from "@ai-matrx/design-system";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useClippedContentGuard } from "@/lib/layout/useClippedContentGuard";
import { toast } from "@/lib/toast";

import {
  computeCopySubset,
  copySubsetText,
  initialCopySubsetState,
  visibleCopySubsetColumns,
} from "@/components/agent-copy/copy-subset/model";
import { copySubsetSize } from "@/components/agent-copy/copy-subset/serialize";
import {
  getCopySubsetSession,
  loadCopySubsetSessionRows,
  releaseCopySubsetSession,
  type CopySubsetSession,
} from "@/components/agent-copy/copy-subset/session";
import {
  COPY_SUBSET_FORMATS,
  toMatrxColumn,
  type CopySubsetColumn,
  type CopySubsetFormat,
  type CopySubsetState,
} from "@/components/agent-copy/copy-subset/types";

/** Size estimate refresh delay while the user is still shaping. */
const SIZE_ESTIMATE_DEBOUNCE_MS = 150;

export interface CopySubsetWindowProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  title?: string;
}

function initialRect() {
  const width = Math.min(1280, Math.max(760, window.innerWidth - 48));
  const height = Math.min(820, Math.max(520, window.innerHeight - 40));
  return {
    x: Math.max(12, (window.innerWidth - width) / 2),
    y: Math.max(10, (window.innerHeight - height) / 2),
    width,
    height,
  };
}

function isCopySubsetFormat(value: string): value is CopySubsetFormat {
  return COPY_SUBSET_FORMATS.some((format) => format.id === value);
}

export function CopySubsetWindow({
  isOpen,
  onClose,
  sessionId,
  title,
}: CopySubsetWindowProps) {
  const session = getCopySubsetSession(sessionId);

  // The session is released when this window unmounts (close, navigation,
  // "close all"); the opener's `close()` also releases for handles.
  useEffect(() => () => releaseCopySubsetSession(sessionId), [sessionId]);

  if (!isOpen) return null;

  if (!session) {
    return (
      <WindowPanel
        id={`copy-subset-${sessionId}`}
        title={title ?? "Copy subset"}
        onClose={onClose}
        initialRect={initialRect()}
        minWidth={520}
        minHeight={240}
        bodyClassName="bg-background"
      >
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="text-sm font-medium">This copy session is gone</p>
          <p className="max-w-md text-xs text-muted-foreground">
            The rows it held were released (a reload or navigation). Close this
            window and choose “Filter &amp; sort before copying…” again from the
            Copy-for-AI menu.
          </p>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </WindowPanel>
    );
  }

  return (
    <CopySubsetWindowBody
      session={session}
      title={title ?? session.source.label}
      onClose={onClose}
    />
  );
}

function CopySubsetWindowBody<T>({
  session,
  title,
  onClose,
}: {
  session: CopySubsetSession<T>;
  title: string;
  onClose: () => void;
}) {
  const [rect] = useState(() => initialRect());
  const [loading, setLoading] = useState(session.pending);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [state, setState] = useState<CopySubsetState>(() =>
    initialCopySubsetState(session),
  );
  const [columnSearch, setColumnSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [estimate, setEstimate] = useState<{
    chars: number;
    bytesLabel: string;
    tokens: number;
  } | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useClippedContentGuard(bodyRef, { label: "copy-subset window body" });

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      await loadCopySubsetSessionRows(session);
      setState(initialCopySubsetState(session));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setLoadError(message);
      toast.error(`Couldn't load the rows: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  // The loader runs once per window: the session is fixed for the window's
  // life, so a re-render must never start a second load.
  const loadStartedRef = useRef(false);
  useEffect(() => {
    if (loadStartedRef.current) return;
    loadStartedRef.current = true;
    if (session.pending) void load();
  }, [session, load]);

  const visibleColumns = visibleCopySubsetColumns(
    session.columns,
    state.hiddenColumnIds,
  );
  const computation = computeCopySubset(session, state);

  // Live size of the EXACT text the Copy button writes, debounced while the
  // user is still typing a search or ticking rows.
  useEffect(() => {
    if (loading) return;
    const handle = window.setTimeout(() => {
      const { text } = copySubsetText(session, state);
      const size = copySubsetSize(text);
      setEstimate({
        chars: size.chars,
        bytesLabel: size.bytesLabel,
        tokens: size.tokens,
      });
    }, SIZE_ESTIMATE_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [session, state, loading]);

  const tableColumns: MatrxColumnDef<T>[] = visibleColumns.map((column) => {
    const base = toMatrxColumn(column);
    return {
      ...base,
      cellKind: "text",
      cell: (row: T) => {
        const text = stringifyCellValue(getCellValue(row, base));
        return (
          <span
            className="block max-w-[32rem] whitespace-pre-wrap break-words text-xs"
            title={text}
          >
            {text || <span className="text-muted-foreground">—</span>}
          </span>
        );
      },
    };
  });

  const layeredFields: LayeredFilterField[] = visibleColumns.map((column) =>
    column.filter === "number"
      ? { id: column.id, label: column.header, kind: "number" as const }
      : { id: column.id, label: column.header, kind: "text" as const },
  );

  const setQuery = (query: MatrxDataTableQueryState) =>
    setState((current) => ({ ...current, query }));

  /** Hiding a column also drops its filter and sort — the table cannot show
   *  a filter on a column it no longer renders, so the model never applies one. */
  const setHiddenColumnIds = (hiddenColumnIds: string[]) => {
    const hidden = new Set(hiddenColumnIds);
    setState((current) => ({
      ...current,
      hiddenColumnIds,
      query: {
        ...current.query,
        page: 1,
        columnFilters: Object.fromEntries(
          Object.entries(current.query.columnFilters).filter(
            ([id]) => !hidden.has(id),
          ),
        ),
        layeredFilters: current.query.layeredFilters?.filter(
          (rule) => !hidden.has(rule.field),
        ),
        sort:
          current.query.sort && !hidden.has(current.query.sort.id)
            ? current.query.sort
            : null,
      },
    }));
  };

  const setSelectedRowIds = (selectedRowIds: string[]) =>
    setState((current) => ({ ...current, selectedRowIds }));

  const setFormat = (format: CopySubsetFormat) =>
    setState((current) => ({ ...current, format }));

  const copy = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { text, computation: fresh } = copySubsetText(session, state);
      await writeClipboard(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
      const formatLabel =
        COPY_SUBSET_FORMATS.find((f) => f.id === state.format)?.label ??
        state.format;
      toast.success(
        `${session.source.label} copied (${formatLabel}) — ${fresh.meta.copied_rows.toLocaleString()} ${fresh.meta.copied_rows === 1 ? "row" : "rows"}, ${fresh.meta.copied_columns.toLocaleString()} ${fresh.meta.copied_columns === 1 ? "column" : "columns"}`,
      );
      session.source.onCopied?.({ text, meta: fresh.meta });
    } catch (error: unknown) {
      toast.error(
        `Couldn't copy ${session.source.label}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  /** Right-click a row → the menu's Copy / AI / Export act on THAT row's
   *  visible columns, not the whole preview. No entity: rows are arbitrary. */
  const resolveRowContext = (target: HTMLElement | null) => {
    const id = target?.closest("[data-row-id]")?.getAttribute("data-row-id");
    if (!id) return null;
    const row = session.rows.find((r) => session.getRowId(r) === id);
    if (!row) return null;
    return {
      content: visibleColumns
        .map(
          (column) =>
            `${column.header}: ${stringifyCellValue(getCellValue(row, toMatrxColumn(column)))}`,
        )
        .join("\n"),
    };
  };

  const canCopy =
    !loading &&
    !loadError &&
    computation.rows.length > 0 &&
    computation.columns.length > 0;

  const shapingActive =
    Boolean(state.query.search.trim()) ||
    computation.meta.active_filters > 0 ||
    state.selectedRowIds.length > 0;

  return (
    <WindowPanel
      id={`copy-subset-${session.id}`}
      title={`Copy — ${title}`}
      onClose={onClose}
      initialRect={rect}
      minWidth={680}
      minHeight={460}
      sidebar={
        <ColumnChooser
          columns={session.columns}
          hiddenIds={state.hiddenColumnIds}
          search={columnSearch}
          onSearchChange={setColumnSearch}
          onHiddenIdsChange={setHiddenColumnIds}
        />
      }
      sidebarDefaultSize={300}
      sidebarMinSize={220}
      sidebarClassName="overflow-hidden"
      bodyClassName="overflow-hidden bg-background"
      footerVariant="rich"
      footer={
        <div className="flex w-full flex-wrap items-center gap-3 px-3 py-2">
          <ToggleGroup
            type="single"
            value={state.format}
            onValueChange={(value) => {
              if (typeof value === "string" && isCopySubsetFormat(value)) {
                setFormat(value);
              }
            }}
            aria-label="Copy format"
            className="grid grid-cols-4 gap-1 rounded-md bg-muted/60 p-0.5"
          >
            {COPY_SUBSET_FORMATS.map((format) => (
              <ToggleGroupItem
                key={format.id}
                value={format.id}
                className="h-7 whitespace-nowrap rounded px-2 text-xs font-medium data-[state=on]:bg-background data-[state=on]:shadow-sm"
              >
                {format.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div
            className="min-w-0 flex-1 text-xs tabular-nums text-muted-foreground"
            aria-live="polite"
          >
            <span className="font-semibold text-foreground">
              {computation.rows.length.toLocaleString()} of{" "}
              {session.rows.length.toLocaleString()} rows
            </span>{" "}
            · {computation.columns.length.toLocaleString()} of{" "}
            {session.columns.length.toLocaleString()} columns
            {state.selectedRowIds.length > 0
              ? ` · ${computation.rows.length.toLocaleString()} selected of ${computation.matched.length.toLocaleString()} matching`
              : ""}
            {estimate
              ? ` · ${estimate.chars.toLocaleString()} chars · ${estimate.bytesLabel} · ~${estimate.tokens.toLocaleString()} tokens`
              : ""}
          </div>
          <Button type="button" variant="outline" onClick={onClose}>
            Done
          </Button>
          <Button
            type="button"
            disabled={busy || !canCopy}
            onClick={() => void copy()}
            title={
              canCopy
                ? `Copy ${computation.rows.length.toLocaleString()} rows as ${COPY_SUBSET_FORMATS.find((f) => f.id === state.format)?.label}`
                : loading
                  ? "Rows are still loading"
                  : "Nothing to copy — loosen the filters or show a column"
            }
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : copied ? (
              <Check className="h-4 w-4" />
            ) : state.format === "ai" ? (
              <CopyForAiIcon className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            Copy {shapingActive ? "this subset" : "all"}
            {state.format === "ai" ? " for AI" : ""}
          </Button>
        </div>
      }
    >
      <div ref={bodyRef} className="flex h-full min-h-0 flex-col p-2">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading every row…
          </div>
        ) : loadError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="max-w-xl text-sm text-destructive">
              Couldn&apos;t load the rows: {loadError}
            </p>
            <Button type="button" variant="outline" onClick={() => void load()}>
              <RotateCcw className="h-4 w-4" /> Retry
            </Button>
          </div>
        ) : visibleColumns.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Columns3 className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Show at least one column</p>
            <p className="max-w-md text-xs text-muted-foreground">
              Every column is hidden. Tick one in the Columns panel to preview
              and copy it.
            </p>
          </div>
        ) : (
          <NonEditableContextMenu
            sourceFeature="internal"
            contentSource={{ type: "raw" }}
            resolveContextOnOpen={resolveRowContext}
          >
            <MatrxDataTable<T>
              data={session.rows}
              columns={tableColumns}
              getRowId={session.getRowId}
              query={{
                mode: "controlled-local",
                state: state.query,
                onStateChange: setQuery,
              }}
              toolbar={{
                searchPlaceholder: "Search every shown column…",
                searchMatch: {},
                layeredFilters: {
                  fields: layeredFields,
                  maxRules: 20,
                  label: "Advanced row filters",
                },
                actions: (
                  <div className="ml-auto flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 px-2 text-xs"
                      onClick={() =>
                        setSelectedRowIds(
                          computation.matched.map((row) =>
                            session.getRowId(row),
                          ),
                        )
                      }
                    >
                      Select matching (
                      {computation.matched.length.toLocaleString()})
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs"
                      disabled={state.selectedRowIds.length === 0}
                      onClick={() => setSelectedRowIds([])}
                    >
                      Clear selection
                    </Button>
                  </div>
                ),
              }}
              selection={{
                selectedIds: state.selectedRowIds,
                onSelectedIdsChange: setSelectedRowIds,
                noun: "row",
              }}
              detail={{ enabled: false }}
              window={{ enabled: false }}
              pageSize={state.query.pageSize}
              pageSizeOptions={[20, 50, 100, 200]}
              className="min-h-0 flex-1"
              emptyState={{
                title: "No rows match",
                description:
                  "Clear or loosen the search and filters to see more rows.",
              }}
            />
          </NonEditableContextMenu>
        )}
      </div>
    </WindowPanel>
  );
}

function ColumnChooser<T>({
  columns,
  hiddenIds,
  search,
  onSearchChange,
  onHiddenIdsChange,
}: {
  columns: CopySubsetColumn<T>[];
  hiddenIds: string[];
  search: string;
  onSearchChange: (value: string) => void;
  onHiddenIdsChange: (ids: string[]) => void;
}) {
  const hidden = new Set(hiddenIds);
  const query = search.trim().toLocaleLowerCase();
  const shown = query
    ? columns.filter(
        (column) =>
          column.header.toLocaleLowerCase().includes(query) ||
          column.id.toLocaleLowerCase().includes(query),
      )
    : columns;
  const shownCount = columns.length - hiddenIds.length;

  return (
    <section className="flex h-full min-h-0 flex-col bg-card">
      <div className="shrink-0 space-y-3 border-b border-border p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Columns</h2>
            <p className="text-xs text-muted-foreground">
              {shownCount.toLocaleString()} of {columns.length.toLocaleString()}{" "}
              shown
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={hiddenIds.length === 0}
              onClick={() => onHiddenIdsChange([])}
            >
              Show all
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={hiddenIds.length === columns.length}
              onClick={() => onHiddenIdsChange(columns.map((c) => c.id))}
            >
              Hide all
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Find a column…"
            className="h-8 pl-8 text-base"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {shown.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No columns match “{search}”.
          </p>
        ) : (
          <div className="space-y-1">
            {shown.map((column) => (
              <label
                key={column.id}
                className="flex min-h-11 cursor-pointer items-start gap-2 rounded-md px-2 py-2 hover:bg-muted"
              >
                <Checkbox
                  checked={!hidden.has(column.id)}
                  onCheckedChange={(checked) =>
                    onHiddenIdsChange(
                      checked === true
                        ? hiddenIds.filter((id) => id !== column.id)
                        : [...new Set([...hiddenIds, column.id])],
                    )
                  }
                  aria-label={`Show ${column.header}`}
                  className="mt-0.5"
                />
                <span className="min-w-0 flex-1">
                  <span className="block whitespace-normal break-words text-sm leading-5">
                    {column.header}
                  </span>
                  {column.id !== column.header ? (
                    <span className="block break-all text-[10px] leading-4 text-muted-foreground">
                      {column.id}
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
