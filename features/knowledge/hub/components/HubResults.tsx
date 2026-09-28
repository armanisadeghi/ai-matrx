"use client";

/**
 * The hub's main pane body.
 *
 *   SEARCHING (text typed) → typed sections (Spotlight / Linear): Top hit, then
 *     Sources, Segments, Chats … each with its count, its own skeleton while
 *     its lane runs, its own failure sentence + retry, and "Show all" paging
 *     that section alone by its cursor.
 *   BROWSING (a view)     → the same results as list (virtualized — the design
 *     system's window math) · table (the design system's data table, with its
 *     column facets) · board (by kind) · gallery.
 */

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCw } from "lucide-react";
import { Skeleton } from "@ai-matrx/design-system";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import { computeVariableWindow } from "@ai-matrx/design-system/data-table/virtual-window";
import { formatRelativeTime } from "@ai-matrx/kit/format";
import { cn } from "@/utils/cn";
import type { KnowledgeHit, KnowledgeSectionKey } from "@/features/knowledge/api/knowledgeSearch";
import type { HubLayout } from "@/features/knowledge/hub/hubState";
import type { SectionState } from "@/features/knowledge/hub/hooks/useKnowledgeResults";
import {
  capturedByLabel,
  hitKey,
  kindLabel,
  originLabel,
} from "@/features/knowledge/hub/hubPresentation";
import {
  HitTitle,
  ResultCard,
  ResultRow,
  hitWhen,
  resultRowHeight,
  titleLinesFor,
  type ResultHandlers,
} from "@/features/knowledge/hub/components/HubResultRow";
import { dateGroupOf, dateInGroup, groupByDate, type DatedItem } from "@/features/knowledge/hub/dateGroups";

// ─── shared pieces ──────────────────────────────────────────────────────────

export function RowsSkeleton({
  rows = 3,
  label,
  sentence,
}: {
  rows?: number;
  label: string;
  /** A visible line ("Still searching Chats…") — a section still streaming. */
  sentence?: string;
}) {
  return (
    <div className="-mx-2 py-1" aria-label={label} role="status">
      <span className="sr-only">{label}</span>
      {sentence ? <p className="px-2 pb-1 text-xs text-muted-foreground">{sentence}</p> : null}
      {/* The row's own shape: kind tile, title + date, one line of facts. */}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-start gap-3 px-2 py-2">
          <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-2 pt-0.5">
            <div className="flex items-center gap-3">
              <Skeleton className={cn("h-3.5", i % 3 === 0 ? "w-1/2" : i % 3 === 1 ? "w-2/3" : "w-2/5")} />
              <Skeleton className="ml-auto h-3 w-12" />
            </div>
            <Skeleton className={cn("h-3", i % 2 ? "w-3/4" : "w-5/6")} />
            <Skeleton className={cn("h-2.5", i % 2 ? "w-1/4" : "w-1/3")} />
          </div>
          {/* The row's reserved menu column, so the date lines up with the rows that replace it. */}
          <div className="w-7 shrink-0" />
        </div>
      ))}
    </div>
  );
}

function SectionError({
  message,
  retryable,
  onRetry,
}: {
  message: string;
  retryable: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs">
      <span className="min-w-0 flex-1 text-destructive">
        {message}
        <ErrorAlchemyMenu error={message} size="xs" />
      </span>
      {retryable ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-foreground hover:bg-accent"
        >
          <RotateCw className="h-3 w-3" /> Try again
        </button>
      ) : null}
    </div>
  );
}

// ─── searching: typed sections ──────────────────────────────────────────────

export function orderedSearchHits(sections: SectionState[]): KnowledgeHit[] {
  const out: KnowledgeHit[] = [];
  const seen = new Set<string>();
  for (const s of sections) {
    for (const h of s.section?.items ?? []) {
      const k = hitKey(h);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(h);
    }
  }
  return out;
}

export function SearchSections({
  text,
  sections,
  handlers,
  onShowMore,
  onRetry,
}: {
  text: string;
  sections: SectionState[];
  handlers: ResultHandlers;
  onShowMore: (key: KnowledgeSectionKey) => void;
  onRetry: (key: KnowledgeSectionKey) => void;
}) {
  const settled = sections.every((s) => s.status !== "loading");
  const empty = sections.filter(
    (s) => s.key !== "top_hit" && s.status === "ready" && (s.section?.items.length ?? 0) === 0 && !s.section?.withheld,
  );
  const anything = sections.some((s) => (s.section?.items.length ?? 0) > 0);
  return (
    <div className="-mx-2 space-y-5 pb-10" role="listbox" aria-label="Search results">
      {sections.map((s) => {
        if (s.key === "top_hit") {
          if (s.status === "loading" || !s.section?.items.length) return null;
          return (
            <section key={s.key} aria-label="Top hit">
              <h3 className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Top hit
              </h3>
              <ResultRow hit={s.section.items[0]} handlers={handlers} />
            </section>
          );
        }
        const label = s.section?.label ?? s.key;
        if (s.status === "ready" && !s.section?.items.length && !s.section?.withheld) return null;
        return (
          <section key={s.key} aria-label={label}>
            <h3 className="flex items-baseline gap-2 px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <span>{label}</span>
              {s.status === "ready" && typeof s.section?.count === "number" ? (
                <span className="tabular-nums normal-case tracking-normal">{s.section.count}</span>
              ) : null}
            </h3>
            {s.status === "loading" ? <RowsSkeleton label={`Searching ${label}`} sentence={`Still searching ${label}…`} rows={2} /> : null}
            {s.status === "error" && s.section?.error ? (
              <SectionError
                message={s.section.error.message}
                retryable={s.section.error.retryable}
                onRetry={() => onRetry(s.key)}
              />
            ) : null}
            {s.section?.withheld ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">{s.section.withheld}</p>
            ) : null}
            {(s.section?.items ?? []).map((h) => (
              <ResultRow key={hitKey(h)} hit={h} handlers={handlers} />
            ))}
            {s.moreError ? (
              <SectionError message={s.moreError} retryable onRetry={() => onShowMore(s.key)} />
            ) : null}
            {s.section?.next_cursor ? (
              <button
                type="button"
                onClick={() => onShowMore(s.key)}
                disabled={s.loadingMore}
                className="ml-2 mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {s.loadingMore ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {s.loadingMore
                  ? `Loading more ${label}…`
                  : `Show all ${typeof s.section.count === "number" ? s.section.count : ""} ${label}`.replace(/\s+/g, " ")}
              </button>
            ) : null}
          </section>
        );
      })}
      {settled && !anything ? (
        <p className="px-2 text-sm text-muted-foreground">
          Nothing matches &ldquo;{text}&rdquo;. Try fewer words or remove a filter.
        </p>
      ) : null}
      {settled && anything && empty.length ? (
        <p className="px-2 text-xs text-muted-foreground">
          No matches in {empty.map((s) => s.section?.label ?? s.key).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}

// ─── browsing: layouts ──────────────────────────────────────────────────────

/** Every hit is the same kind (a Transcripts view, a Files view) — the kind word on each row is noise. */
export function oneKind(hits: KnowledgeHit[]): boolean {
  if (hits.length < 2) return false;
  const first = kindLabel(hits[0]);
  return hits.every((h) => kindLabel(h) === first);
}

const HEADER_H = 32;
/** Below this pane width a row goes compact: two-line title, date in the facts. */
const COMPACT_W = 560;

type ListItem = DatedItem<KnowledgeHit>;

/**
 * The list layout: windowed (the design system's variable window math), and —
 * when the page sorts by date — sectioned the way Granola is: Today,
 * Yesterday, Previous 7 days, Previous 30 days, then month by month, with the
 * current section pinned quietly at the top while you scroll.
 */
const END_H = 40;

type MoreState = { has: boolean; loading: boolean; error: string | null; load: () => void };

/** A scrolled container near its end reads the next page (board and gallery). */
function nearEnd(el: HTMLElement, more?: MoreState) {
  if (!more?.has || more.loading || more.error) return;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - REACH_END_PX) more.load();
}
/** Start reading the next page this far before the end — the reader never waits at a button. */
const REACH_END_PX = 600;

function VirtualList({
  hits,
  handlers,
  groupByDate: grouped,
  more,
  initialScrollTop,
  onScrollTop,
}: {
  hits: KnowledgeHit[];
  handlers: ResultHandlers;
  groupByDate?: boolean;
  /** Infinite scroll: the next page, its state, and a failure's retry. */
  more?: MoreState;
  /** Where the list was when the person left it (Back restores it). */
  initialScrollTop?: number;
  onScrollTop?: (top: number) => void;
}) {
  const hideKind = oneKind(hits);
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [viewport, setViewport] = useState(800);
  const [width, setWidth] = useState(1000);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      setViewport(el.clientHeight || 800);
      setWidth(el.clientWidth || 1000);
    };
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  const compact = width < COMPACT_W;
  const now = new Date();
  const items: ListItem[] = grouped
    ? groupByDate(hits, hitWhen, now)
    : hits.map((h) => ({ kind: "row" as const, item: h, group: { key: "undated" as const, label: "" } }));
  const lines = items.map((it) => (it.kind === "row" ? titleLinesFor(it.item.title, width, compact) : 1));
  const sizes = items.map((it, i) => (it.kind === "header" ? HEADER_H : resultRowHeight(it.item, handlers, lines[i], compact)));
  const starts: number[] = [];
  const listHeight = sizes.reduce((acc, n, i) => ((starts[i] = acc), acc + n), 0);
  const endRow = more && (more.has || more.loading || more.error) ? END_H : 0;
  // Back to the list: the scroll position comes back once the rows it pointed at are drawn.
  const restored = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || restored.current || !initialScrollTop) return;
    if (listHeight + endRow < initialScrollTop + el.clientHeight && more?.has) return;
    restored.current = true;
    el.scrollTop = initialScrollTop;
    setOffset(el.scrollTop);
  }, [listHeight, endRow, initialScrollTop, more?.has]);
  // Near the end: read the next page (once per page — `loading` holds it).
  useEffect(() => {
    if (!more?.has || more.loading || more.error) return;
    if (offset + viewport >= listHeight - REACH_END_PX) more.load();
  }, [offset, viewport, listHeight, more]);
  // Keep the keyboard-focused row in view.
  useEffect(() => {
    const el = ref.current;
    if (!el || !handlers.focusedKey) return;
    const i = items.findIndex((it) => it.kind === "row" && hitKey(it.item) === handlers.focusedKey);
    if (i < 0) return;
    const top = starts[i];
    const pin = grouped ? HEADER_H : 0;
    if (top - pin < el.scrollTop) el.scrollTop = Math.max(0, top - pin);
    else if (top + sizes[i] > el.scrollTop + el.clientHeight) el.scrollTop = top + sizes[i] - el.clientHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handlers.focusedKey, hits]);
  const w = computeVariableWindow({ count: items.length, sizeAt: (i) => sizes[i] ?? 0, viewport, offset });
  // The section the top of the viewport is in (pinned header).
  let current: ListItem | null = null;
  if (grouped)
    for (let i = 0; i < items.length && starts[i] <= offset; i++) if (items[i].kind === "header") current = items[i];
  return (
    <div
      ref={ref}
      // -mx-2 + the row's px-2: the tile sits on the pane's own 16px edge, in line with the
      // search box and facets, while the hover fill still reaches past it (Linear).
      className="relative -mx-2 min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
      onScroll={(e) => {
        setOffset(e.currentTarget.scrollTop);
        onScrollTop?.(e.currentTarget.scrollTop);
      }}
      role="listbox"
      aria-label="Results"
    >
      {current && current.kind === "header" && offset > 0 ? (
        <div className="pointer-events-none sticky top-0 z-10 -mb-8 h-8" aria-hidden>
          <SectionHeader label={current.group.label} pinned />
        </div>
      ) : null}
      <div style={{ height: w.padStart }} />
      {items.slice(w.start, w.end).map((it, j) => {
        const i = w.start + j;
        if (it.kind === "header")
          return (
            <div key={`h:${it.group.key}:${i}`} style={{ height: sizes[i] }} role="presentation">
              <SectionHeader label={it.group.label} />
            </div>
          );
        return (
          <ResultRow
            key={hitKey(it.item)}
            hit={it.item}
            handlers={handlers}
            style={{ height: sizes[i] }}
            hideKind={hideKind}
            compact={compact}
            titleLines={lines[i]}
            whenLabel={grouped ? dateInGroup(hitWhen(it.item), it.group, now) : undefined}
          />
        );
      })}
      <div style={{ height: w.padEnd }} />
      {endRow ? (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground" style={{ height: END_H }} role="status">
          {more?.error ? (
            <>
              <span className="min-w-0 truncate text-destructive">{more.error}</span>
              <button type="button" className="font-medium text-foreground underline-offset-2 hover:underline" onClick={more.load}>
                Try again
              </button>
            </>
          ) : more?.loading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading more…
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** A date section's name. No count: a count over the loaded rows would change as more load. */
function SectionHeader({ label, pinned = false }: { label: string; pinned?: boolean }) {
  return (
    <div
      className={cn(
        "flex h-8 items-end gap-2 px-2 pb-1.5 text-xs font-medium text-muted-foreground",
        // The page's own surface, opaque, so rows pass cleanly beneath it; a hairline says it is pinned.
        pinned && "bg-textured border-b border-border/50",
      )}
    >
      <span className="text-foreground/80">{label}</span>
    </div>
  );
}

/**
 * The Stage column's two faces: the words it sorts and filters by, and the
 * cell (with its Re-index / Retry remedy). Only Sources have a stage.
 */
export interface HubStageColumn {
  label: (hit: KnowledgeHit) => string;
  cell: (hit: KnowledgeHit) => React.ReactNode;
}

const STAGE_SORT_ORDER = ["Failed", "Couldn't read status", "Index stale", "Indexing", "Not yet searchable", "Searchable", "Checking…", "—"];

/**
 * The table layout's columns — Name, Kind, Captured by, Stage, When (+ Origin,
 * Filed under). Every column sorts by clicking its header (the design
 * system's local sort) and filters from its header menu.
 */
export function hubTableColumns(
  stage?: HubStageColumn,
  handlers?: ResultHandlers,
  hits?: KnowledgeHit[],
): MatrxColumnDef<KnowledgeHit>[] {
  const when = (h: KnowledgeHit) => h.updated_at ?? h.created_at ?? "";
  // A column no loaded row has a value for is absent, never a column of "Not reported".
  const any = (has: (h: KnowledgeHit) => boolean) => !hits || hits.some(has);
  const single = hits ? oneKind(hits) : false;
  return [
    {
      id: "title",
      header: "Name",
      // The name takes the room; the rest are narrow facts.
      width: "45%",
      minWidth: 280,
      accessorFn: (h) => h.title,
      sortValue: (h) => h.title.toLowerCase(),
      cell: (h) =>
        handlers ? (
          <HitTitle hit={h} handlers={handlers} className="min-w-0 truncate font-medium" />
        ) : (
          <span className="font-medium">{h.title}</span>
        ),
      filter: "text",
    },
    ...(single ? [] : [{ id: "kind", header: "Kind", accessorFn: (h: KnowledgeHit) => kindLabel(h), filter: "select" as const }]),
    ...(any((h) => Boolean(h.captured_by?.name))
      ? [{ id: "captured_by", header: "Captured by", accessorFn: (h: KnowledgeHit) => capturedByLabel(h), filter: "select" as const }]
      : []),
    ...(stage
      ? [
          {
            id: "stage",
            header: "Stage",
            accessorFn: (h: KnowledgeHit) => stage.label(h),
            sortValue: (h: KnowledgeHit) => {
              const i = STAGE_SORT_ORDER.indexOf(stage.label(h));
              return i < 0 ? STAGE_SORT_ORDER.length : i;
            },
            cell: (h: KnowledgeHit) => stage.cell(h),
            filter: "select" as const,
          },
        ]
      : []),
    {
      id: "updated",
      header: "When",
      accessorFn: when,
      sortValue: (h) => (when(h) ? Date.parse(when(h)) : 0),
      defaultSortDirection: "desc",
      cell: (h) => (when(h) ? formatRelativeTime(when(h)) : "—"),
      filter: "date",
    },
    ...(any((h) => Boolean(h.origin))
      ? [{ id: "origin", header: "Origin", accessorFn: (h: KnowledgeHit) => originLabel(h.origin), filter: "select" as const }]
      : []),
    ...(any((h) => Boolean(h.filed_under?.length))
      ? [
          {
            id: "filed",
            header: "Filed under",
            accessorFn: (h: KnowledgeHit) => (h.filed_under ?? []).map((f) => f.name ?? "").filter(Boolean).join(", "),
            filter: "text" as const,
          },
        ]
      : []),
  ];
}

function TableLayout({
  hits,
  handlers,
  loading,
  error,
  onRetry,
  stage,
}: {
  hits: KnowledgeHit[];
  handlers: ResultHandlers;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  stage?: HubStageColumn;
}) {
  const columns = hubTableColumns(stage, handlers, hits);
  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <MatrxDataTable<KnowledgeHit>
        tableId="knowledge-hub"
        data={hits}
        columns={columns}
        getRowId={(h) => hitKey(h)}
        density="condensed"
        viewTabs={false}
        hideToolbar
        facets={{ enabled: true, totalRows: hits.length }}
        searchText={(h) => `${h.title} ${h.snippet ?? ""}`}
        read={{ status: loading ? "loading" : error ? "error" : "ready", error, onRetry, what: "your knowledge" }}
        emptyState={{ title: "Nothing here yet", description: "Nothing in this view matches its filters." }}
        selection={{
          selectedIds: [...handlers.selected],
          onSelectedIdsChange: (ids) => {
            const next = new Set(ids);
            for (const h of hits) {
              const k = hitKey(h);
              if (next.has(k) !== handlers.selected.has(k)) handlers.onToggleSelect(h);
            }
          },
          noun: "item",
        }}
        selectedId={handlers.focusedKey}
        onSelectedIdChange={(id) => {
          const h = hits.find((x) => hitKey(x) === id);
          if (h) handlers.onFocus(h);
        }}
        onRowOpen={(h) => handlers.onOpen(h)}
        detail={{ enabled: false }}
        // The hub pages its own rows (one pager: the list's infinite read); the table shows every loaded row.
        pageSize={0}
        // The row's own menu (Open, Keep, Archive, Tag, File to, Copy, Trash) in the Actions column.
        copy={false}
        rowActions={handlers.rowMenu ? (h) => handlers.rowMenu?.(h) : undefined}
      />
    </div>
  );
}

/**
 * The board's columns: the first grouping that actually splits the rows — by
 * kind, then by what the record says it is (a recording, a YouTube video…),
 * then by origin, then by day. One column of everything is never a board.
 */
export function boardGroups(hits: KnowledgeHit[], handlers: ResultHandlers): { by: string; groups: [string, KnowledgeHit[]][] } {
  const now = new Date();
  const candidates: [string, (h: KnowledgeHit) => string][] = [
    ["kind", (h) => kindLabel(h)],
    ["type", (h) => handlers.rowContent?.(h)?.group ?? kindLabel(h)],
    ["origin", (h) => (h.origin ? originLabel(h.origin) : "Not reported")],
    ["date", (h) => dateGroupOf(hitWhen(h), now).label],
  ];
  let fallback: { by: string; groups: [string, KnowledgeHit[]][] } | null = null;
  for (const [by, of] of candidates) {
    const groups = new Map<string, KnowledgeHit[]>();
    for (const h of hits) {
      const k = of(h);
      groups.set(k, [...(groups.get(k) ?? []), h]);
    }
    const out = { by, groups: [...groups.entries()] };
    if (groups.size > 1) return out;
    fallback ??= out;
  }
  return fallback ?? { by: "kind", groups: [] };
}

function BoardLayout({ hits, handlers, more }: { hits: KnowledgeHit[]; handlers: ResultHandlers; more?: MoreState }) {
  const { by, groups } = boardGroups(hits, handlers);
  const hideKind = oneKind(hits);
  return (
    <div
      className="min-h-0 flex-1 overflow-auto"
      role="listbox"
      aria-label={`Results by ${by}`}
      onScroll={(e) => nearEnd(e.currentTarget, more)}
    >
      <div className="flex min-h-full gap-3 max-md:flex-col md:w-max">
        {[...groups.entries()].map(([label, items]) => (
          <section key={label} className="flex w-full flex-col gap-2 md:w-72" aria-label={label}>
            <h3 className="px-1 text-xs font-medium text-muted-foreground">{label}</h3>
            {items.map((h) => (
              <ResultCard key={hitKey(h)} hit={h} handlers={handlers} hideKind={hideKind} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function GalleryLayout({ hits, handlers, more }: { hits: KnowledgeHit[]; handlers: ResultHandlers; more?: MoreState }) {
  const hideKind = oneKind(hits);
  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
      role="listbox"
      aria-label="Results"
      onScroll={(e) => nearEnd(e.currentTarget, more)}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {hits.map((h) => (
          <ResultCard key={hitKey(h)} hit={h} handlers={handlers} tall hideKind={hideKind} />
        ))}
      </div>
    </div>
  );
}

export function browseHits(sections: SectionState[]): KnowledgeHit[] {
  return orderedSearchHits(sections.filter((s) => s.key !== "top_hit" && s.key !== "segments"));
}

/**
 * Search results as the view's items: every matching item once, in the order
 * the service ranked them, and a matching PASSAGE folded into the item it
 * belongs to (its text becomes the row's snippet, so the match shows) — a
 * passage whose item is not listed yet becomes that item's row.
 */
export function searchHitsByItem(sections: SectionState[]): KnowledgeHit[] {
  const out: KnowledgeHit[] = [];
  const at = new Map<string, number>();
  for (const s of sections) {
    for (const h of s.section?.items ?? []) {
      if (h.entity === "segment" && h.segment?.source_id) {
        const key = `processed_document:${h.segment.source_id}`;
        const i = at.get(key);
        if (i !== undefined) {
          if (!out[i].matched) out[i] = { ...out[i], snippet: h.snippet ?? out[i].snippet, matched: true } as KnowledgeHit;
          continue;
        }
        at.set(key, out.length);
        out.push({
          entity: "processed_document",
          id: h.segment.source_id,
          title: h.segment.source_title || h.title,
          snippet: h.snippet,
          source_kind: h.segment.source_kind ?? null,
          origin: h.origin ?? null,
          organization_id: h.organization_id ?? null,
          created_at: h.created_at ?? null,
          updated_at: h.updated_at ?? null,
          matched: true,
        } as KnowledgeHit);
        continue;
      }
      const key = hitKey(h);
      if (at.has(key)) continue;
      at.set(key, out.length);
      out.push(h);
    }
  }
  return out;
}

export function BrowseResults({
  layout,
  sections,
  hits,
  handlers,
  emptySentence,
  onShowMore,
  onRetry,
  stage,
  emptyExtra,
  groupByDate = false,
  highlight = "",
  restore,
}: {
  layout: HubLayout;
  sections: SectionState[];
  hits: KnowledgeHit[];
  handlers: ResultHandlers;
  emptySentence: string;
  onShowMore: (key: KnowledgeSectionKey) => void;
  onRetry: (key: KnowledgeSectionKey) => void;
  stage?: HubStageColumn;
  /** Shown under the empty sentence (the hub's getting-started tips). */
  emptyExtra?: React.ReactNode;
  /** The hits are newest first: the list layout sections them by date. */
  groupByDate?: boolean;
  /** What was typed: marked in titles and passages. */
  highlight?: string;
  /** Back to the list: its scroll position, and where to keep it as it changes. */
  restore?: { scrollTop?: number; onScrollTop: (top: number) => void };
}) {
  const searching = Boolean(highlight.trim());
  const h = searching ? { ...handlers, highlight } : handlers;
  // Searching: the passages lane is part of the answer (its failure is said, its "more" pages).
  const relevant = sections.filter((s) => s.key !== "top_hit" && (searching || s.key !== "segments"));
  const loading = relevant.some((s) => s.status === "loading");
  const failed = relevant.filter((s) => s.status === "error" && s.section?.error);
  const more = relevant.filter((s) => s.section?.next_cursor);
  const loadingMore = relevant.some((s) => s.loadingMore);

  const failures = failed.length ? (
    <div className="space-y-1.5 pb-2">
      {failed.map((s) => (
        <SectionError
          key={s.key}
          message={`${s.section?.label ?? s.key}: ${s.section?.error?.message ?? ""}`}
          retryable={s.section?.error?.retryable ?? true}
          onRetry={() => onRetry(s.key)}
        />
      ))}
    </div>
  ) : null;

  const moreState: MoreState = {
    has: more.length > 0,
    loading: loadingMore,
    error: relevant.find((s) => s.moreError)?.moreError ?? null,
    load: () => more.forEach((s) => onShowMore(s.key)),
  };
  // The table keeps one quiet "Load more" under it; list, board and gallery read on as you scroll.
  const footer =
    more.length || loadingMore ? (
      <div className="flex shrink-0 justify-center py-2">
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => more.forEach((s) => onShowMore(s.key))}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-70"
        >
          {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {loadingMore ? "Loading more results…" : "Load more"}
        </button>
      </div>
    ) : null;

  if (layout === "table")
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {/* With nothing loaded the table says the failure itself (read=), once;
            the per-section strip is for a partial failure beside rows that did load. */}
        {hits.length > 0 ? failures : null}
        <TableLayout
          hits={hits}
          handlers={h}
          loading={loading && hits.length === 0}
          error={failed.length && !hits.length ? failed.map((s) => s.section?.error?.message).join(" ") : null}
          onRetry={() => failed.forEach((s) => onRetry(s.key))}
          stage={stage}
        />
        {footer}
      </div>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {failures}
      {loading && hits.length === 0 ? <RowsSkeleton rows={8} label="Loading your knowledge" /> : null}
      {!loading && hits.length === 0 && !failed.length ? (
        <div className="flex flex-col items-start gap-3 py-8">
          <p className="max-w-prose text-sm text-muted-foreground">{emptySentence}</p>
          {emptyExtra}
        </div>
      ) : null}
      {hits.length ? (
        layout === "board" ? (
          <BoardLayout hits={hits} handlers={h} more={moreState} />
        ) : layout === "gallery" ? (
          <GalleryLayout hits={hits} handlers={h} more={moreState} />
        ) : (
          <VirtualList
            hits={hits}
            handlers={h}
            groupByDate={groupByDate}
            more={moreState}
            initialScrollTop={restore?.scrollTop}
            onScrollTop={restore?.onScrollTop}
          />
        )
      ) : null}
      {hits.length && layout !== "list" && (moreState.loading || moreState.error) ? (
        <div className="flex shrink-0 items-center justify-center gap-2 py-2 text-xs text-muted-foreground" role="status">
          {moreState.error ? (
            <>
              <span className="text-destructive">{moreState.error}</span>
              <button type="button" className="font-medium text-foreground hover:underline" onClick={moreState.load}>
                Try again
              </button>
            </>
          ) : (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading more…
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
