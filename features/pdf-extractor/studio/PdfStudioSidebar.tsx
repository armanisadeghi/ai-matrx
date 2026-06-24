"use client";

/**
 * PdfStudioSidebar — the left rail of the studio.
 *
 *   ┌──────────────────┐
 *   │ Search           │
 *   │ Filters · Sort   │
 *   ├──────────────────┤
 *   │ Doc 1            │  ← scrollable virtualized list
 *   │ Doc 2            │
 *   │ Doc 3 (active)   │
 *   │ ...              │
 *   ├──────────────────┤
 *   │ N docs · refresh │
 *   └──────────────────┘
 *
 * Built for a corpus of tens of thousands of docs — the list is metadata-
 * only, search filters client-side, and the row is intentionally compact so
 * a project manager can scan dozens at a glance.
 */

import React, { useRef, useEffect, useState } from "react";
import {
  Search,
  RefreshCw,
  ArrowUpDown,
  Filter,
  Layers,
  GitBranch,
  CheckCircle2,
  FileX2,
  Plus,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { ItemMenu, ItemContextMenu } from "@/components/official/item/ItemMenu";
import {
  usePdfStudioDocs,
  type StudioDocSummary,
} from "./hooks/usePdfStudioDocs";
import { buildPdfDocMenu } from "./pdfDocMenu";
import { FileContextDialog } from "@/features/files/components/FileContextSection";
import { PdfStudioSidebarToggle } from "./PdfStudioSidebarToggle";
import { PdfStudioPagesNav } from "./PdfStudioPagesNav";
import type { SidebarView } from "../state/types";
import type { PdfPageRow } from "../hooks/useProcessedDocumentPages";
import type { PdfDocument } from "../hooks/usePdfExtractor";

export type StudioDocsState = ReturnType<typeof usePdfStudioDocs>;

interface PdfStudioSidebarProps {
  docsState: StudioDocsState;
  activeDocId: string | null;
  onSelectDoc: (doc: StudioDocSummary) => void;
  /** Archive (soft-delete) a doc. Owns optimistic update + active cleanup. */
  onDeleteDoc: (id: string) => Promise<void>;
  /** Opens the upload drawer. When omitted the `+ Add` button is hidden. */
  onAddDocs?: () => void;
  /** Which view to render: files list or pages list. */
  view: SidebarView;
  onChangeView: (view: SidebarView) => void;
  /** For the pages view. */
  activeDoc: PdfDocument | null;
  pageRowCount: number;
  hasPageRows: boolean;
  pages: PdfPageRow[];
  pagesLoading: boolean;
  activePage: number | null;
  onSelectPage: (pageNumber: number) => void;
}

export function PdfStudioSidebar({
  docsState,
  activeDocId,
  onSelectDoc,
  onDeleteDoc,
  onAddDocs,
  view,
  onChangeView,
  activeDoc,
  pageRowCount,
  hasPageRows,
  pages,
  pagesLoading,
  activePage,
  onSelectPage,
}: PdfStudioSidebarProps) {
  const {
    visible,
    docs,
    kinds,
    loading,
    refresh,
    search,
    setSearch,
    sortBy,
    setSortBy,
    filterKind,
    setFilterKind,
    tier,
    setTier,
  } = docsState;

  // Scroll active doc into view when the active id changes externally.
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!activeDocId || !listRef.current) return;
    const el = listRef.current.querySelector(
      `[data-doc-id="${activeDocId}"]`,
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeDocId]);

  const inPagesView = view === "pages" && activeDocId != null;

  return (
    <aside className="flex flex-col h-full min-h-0 border-r border-border bg-card/30">
      {/* Toggle: files ↔ pages */}
      <div className="shrink-0 px-3 pt-2.5 pb-1.5">
        <PdfStudioSidebarToggle
          view={inPagesView ? "pages" : "files"}
          onChange={onChangeView}
          disablePages={!activeDocId}
        />
      </div>

      {inPagesView && activeDoc ? (
        <PdfStudioPagesNav
          doc={activeDoc}
          pageRowCount={pageRowCount}
          hasPageRows={hasPageRows}
          pages={pages}
          activePage={activePage}
          loading={pagesLoading}
          onSelectPage={onSelectPage}
        />
      ) : inPagesView ? null : (
        <>
          {/* Search + Add */}
          <div className="shrink-0 px-3 pt-1 pb-2 space-y-2">
            {onAddDocs && (
              <button
                type="button"
                onClick={onAddDocs}
                className="w-full h-8 flex items-center justify-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 hover:bg-primary/15 text-primary text-xs font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add documents
              </button>
            )}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search documents…"
                className="h-8 pl-7 text-xs"
                style={{ fontSize: "16px" }}
              />
            </div>

            {/* Tier toggle */}
            <div className="flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5 h-7 text-[10px]">
              {(["all", "roots", "derivatives"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTier(t)}
                  className={cn(
                    "flex-1 h-6 rounded-md px-1.5 capitalize transition-colors",
                    tier === t
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Filter + sort row */}
            <div className="flex items-center gap-1">
              <div className="relative flex-1">
                <Filter className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <select
                  value={filterKind ?? ""}
                  onChange={(e) => setFilterKind(e.target.value || null)}
                  className="w-full h-7 pl-6 pr-2 text-[11px] rounded-md border border-border bg-background text-foreground"
                >
                  <option value="">All kinds</option>
                  {kinds.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
              <div className="relative flex-1">
                <ArrowUpDown className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <select
                  value={sortBy}
                  onChange={(e) =>
                    setSortBy(e.target.value as "recent" | "name" | "size")
                  }
                  className="w-full h-7 pl-6 pr-2 text-[11px] rounded-md border border-border bg-background text-foreground"
                >
                  <option value="recent">Recent</option>
                  <option value="name">Name</option>
                  <option value="size">Pages</option>
                </select>
              </div>
            </div>
          </div>

          {/* List */}
          <div
            ref={listRef}
            className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-2 pb-2 space-y-0.5"
          >
            {loading && docs.length === 0 ? (
              <SidebarSkeleton />
            ) : visible.length === 0 ? (
              <div className="px-3 py-6 text-center">
                <p className="text-[11px] text-muted-foreground">
                  {docs.length === 0
                    ? "No documents yet."
                    : "No matches for the current filter."}
                </p>
              </div>
            ) : (
              visible.map((d) => (
                <DocRow
                  key={d.id}
                  doc={d}
                  active={activeDocId === d.id}
                  onClick={() => onSelectDoc(d)}
                  onDeleteDoc={onDeleteDoc}
                />
              ))
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-border px-3 py-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">
                {visible.length.toLocaleString()}
              </span>{" "}
              / {docs.length.toLocaleString()} docs
            </span>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="p-1 hover:text-foreground transition-colors rounded disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function DocRow({
  doc,
  active,
  onClick,
  onDeleteDoc,
}: {
  doc: StudioDocSummary;
  active: boolean;
  onClick: () => void;
  onDeleteDoc: (id: string) => Promise<void>;
}) {
  const isMobile = useIsMobile();
  const isDerivative = !!doc.parentProcessedId;
  const [contextOpen, setContextOpen] = useState(false);
  const cloudFileId =
    doc.sourceKind === "cld_file" && doc.sourceId ? doc.sourceId : null;
  // Lazy form — the menu config is only built when the kebab / context menu
  // opens, so a long list doesn't construct N configs per render.
  const menu = () =>
    buildPdfDocMenu({
      doc,
      onDelete: onDeleteDoc,
      onSetContext: cloudFileId ? () => setContextOpen(true) : undefined,
    });

  const row = (
    <div
      data-doc-id={doc.id}
      className={cn(
        "group/item relative rounded-md transition-colors",
        active
          ? "bg-primary/10 border-l-2 border-primary"
          : "border-l-2 border-transparent hover:bg-accent/50",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-start gap-2 px-2 py-1.5 pr-7 rounded-md text-left"
      >
        <div
          className={cn(
            "shrink-0 w-6 h-6 rounded flex items-center justify-center mt-0.5",
            active ? "bg-primary/20" : "bg-muted",
          )}
        >
          {isDerivative ? (
            <GitBranch
              className={cn(
                "w-3 h-3",
                active ? "text-primary" : "text-muted-foreground",
              )}
            />
          ) : (
            <Layers
              className={cn(
                "w-3 h-3",
                active ? "text-primary" : "text-muted-foreground",
              )}
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-[11px] font-medium leading-tight truncate",
              active ? "text-foreground" : "text-foreground/80",
            )}
          >
            {doc.name}
          </p>
          <p className="text-[9px] text-muted-foreground/70 leading-tight truncate mt-0.5">
            {doc.totalPages != null
              ? `${doc.totalPages.toLocaleString()} pages · `
              : ""}
            {doc.derivationKind} · {formatRelativeTime(doc.createdAt)}
          </p>
          {doc.sourceMissing && (
            <span className="mt-0.5 inline-flex items-center gap-1 text-[9px] text-amber-600 dark:text-amber-400">
              <FileX2 className="w-2.5 h-2.5" />
              Original file removed · text only
            </span>
          )}
        </div>
        {active && (
          <CheckCircle2 className="w-3 h-3 text-primary shrink-0 mt-0.5" />
        )}
      </button>

      {/* Kebab — revealed on hover/focus, always visible on touch. */}
      <ItemMenu config={menu} align="end">
        <button
          type="button"
          aria-label={`Options for ${doc.name}`}
          aria-haspopup="menu"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "absolute right-1 top-1.5 flex h-5 w-5 items-center justify-center rounded-md",
            "text-muted-foreground hover:bg-background hover:text-foreground",
            "opacity-0 transition-opacity",
            "group-hover/item:opacity-100 group-focus-within/item:opacity-100",
            "data-[state=open]:opacity-100 [@media(pointer:coarse)]:opacity-100",
          )}
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </ItemMenu>
    </div>
  );

  // Right-click opens the same menu (disabled on touch, where the kebab is
  // always visible).
  return (
    <>
      <ItemContextMenu config={menu} enabled={!isMobile}>
        {row}
      </ItemContextMenu>
      {cloudFileId ? (
        <FileContextDialog
          fileId={cloudFileId}
          fileName={doc.name}
          open={contextOpen}
          onOpenChange={setContextOpen}
        />
      ) : null}
    </>
  );
}

function SidebarSkeleton() {
  return (
    <div className="space-y-1 pt-1">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="h-10 w-full rounded-md bg-muted/40 animate-pulse"
        />
      ))}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}
