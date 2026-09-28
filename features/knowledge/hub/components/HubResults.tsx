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
import { computeWindow } from "@ai-matrx/design-system/data-table/virtual-window";
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
  type ResultHandlers,
} from "@/features/knowledge/hub/components/HubResultRow";

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
    <div className="space-y-2 px-2 py-1.5" aria-label={label} role="status">
      {sentence ? <p className="text-xs text-muted-foreground">{sentence}</p> : null}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-start gap-2.5">
          <Skeleton className="mt-0.5 h-4 w-4" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-5/6" />
          </div>
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
    <div className="space-y-5 pb-10" role="listbox" aria-label="Search results">
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

const ROW_H = 64;

function VirtualList({ hits, handlers }: { hits: KnowledgeHit[]; handlers: ResultHandlers }) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [viewport, setViewport] = useState(800);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setViewport(el.clientHeight || 800);
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  // Keep the keyboard-focused row in view.
  useEffect(() => {
    const el = ref.current;
    if (!el || !handlers.focusedKey) return;
    const i = hits.findIndex((h) => hitKey(h) === handlers.focusedKey);
    if (i < 0) return;
    const top = i * ROW_H;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H - el.clientHeight;
  }, [handlers.focusedKey, hits]);
  const w = computeWindow({ count: hits.length, itemSize: ROW_H, viewport, offset });
  return (
    <div
      ref={ref}
      className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
      onScroll={(e) => setOffset(e.currentTarget.scrollTop)}
      role="listbox"
      aria-label="Results"
    >
      <div style={{ height: w.padStart }} />
      {hits.slice(w.start, w.end).map((h) => (
        <ResultRow key={hitKey(h)} hit={h} handlers={handlers} style={{ height: ROW_H }} />
      ))}
      <div style={{ height: w.padEnd }} />
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
export function hubTableColumns(stage?: HubStageColumn, handlers?: ResultHandlers): MatrxColumnDef<KnowledgeHit>[] {
  const when = (h: KnowledgeHit) => h.updated_at ?? h.created_at ?? "";
  return [
    {
      id: "title",
      header: "Name",
      accessorFn: (h) => h.title,
      sortValue: (h) => h.title.toLowerCase(),
      cell: (h) =>
        handlers ? (
          <div className="flex min-w-0 items-center gap-1">
            <HitTitle hit={h} handlers={handlers} className="min-w-0 flex-1 truncate font-medium" />
            {handlers.rowMenu?.(h)}
          </div>
        ) : (
          <span className="font-medium">{h.title}</span>
        ),
      filter: "text",
    },
    { id: "kind", header: "Kind", accessorFn: (h) => kindLabel(h), filter: "select" },
    { id: "captured_by", header: "Captured by", accessorFn: (h) => capturedByLabel(h), filter: "select" },
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
    { id: "origin", header: "Origin", accessorFn: (h) => originLabel(h.origin), filter: "select" },
    {
      id: "filed",
      header: "Filed under",
      accessorFn: (h) => (h.filed_under ?? []).map((f) => f.name ?? "").filter(Boolean).join(", "),
      filter: "text",
    },
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
  const columns = hubTableColumns(stage, handlers);
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
      />
    </div>
  );
}

function BoardLayout({ hits, handlers }: { hits: KnowledgeHit[]; handlers: ResultHandlers }) {
  const groups = new Map<string, KnowledgeHit[]>();
  for (const h of hits) {
    const k = kindLabel(h);
    groups.set(k, [...(groups.get(k) ?? []), h]);
  }
  return (
    <div className="min-h-0 flex-1 overflow-auto" role="listbox" aria-label="Results by kind">
      <div className="flex min-h-full gap-3 p-1 max-md:flex-col md:w-max">
        {[...groups.entries()].map(([label, items]) => (
          <section key={label} className="flex w-full flex-col gap-2 md:w-72" aria-label={label}>
            <h3 className="flex items-baseline gap-2 px-1 text-xs font-medium text-muted-foreground">
              {label} <span className="tabular-nums">{items.length}</span>
            </h3>
            {items.map((h) => (
              <ResultCard key={hitKey(h)} hit={h} handlers={handlers} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function GalleryLayout({ hits, handlers }: { hits: KnowledgeHit[]; handlers: ResultHandlers }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden" role="listbox" aria-label="Results">
      <div className="grid grid-cols-1 gap-3 p-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {hits.map((h) => (
          <ResultCard key={hitKey(h)} hit={h} handlers={handlers} tall />
        ))}
      </div>
    </div>
  );
}

export function browseHits(sections: SectionState[]): KnowledgeHit[] {
  return orderedSearchHits(sections.filter((s) => s.key !== "top_hit" && s.key !== "segments"));
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
}) {
  const relevant = sections.filter((s) => s.key !== "top_hit" && s.key !== "segments");
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

  const footer =
    more.length || loadingMore ? (
      <div className="flex justify-center py-3">
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => more.forEach((s) => onShowMore(s.key))}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
        >
          {loadingMore ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {loadingMore ? "Loading more…" : `Load more (${more.map((s) => s.section?.label).join(", ")})`}
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
          handlers={handlers}
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
        <div className="px-2 py-6">
          <p className="text-sm text-muted-foreground">{emptySentence}</p>
          {emptyExtra}
        </div>
      ) : null}
      {hits.length ? (
        layout === "board" ? (
          <BoardLayout hits={hits} handlers={handlers} />
        ) : layout === "gallery" ? (
          <GalleryLayout hits={hits} handlers={handlers} />
        ) : (
          <VirtualList hits={hits} handlers={handlers} />
        )
      ) : null}
      <div className={cn(!hits.length && "hidden")}>{footer}</div>
    </div>
  );
}
