"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Boxes,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  EyeOff,
  Search,
  X,
} from "lucide-react";
import {
  DocumentSearchResultsList,
  DocumentSearchSummary,
} from "@/features/rag/components/library/DocumentSearch";
import type { UseDocumentSearch } from "@/features/rag/hooks/useDocumentSearch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectChunksErrorForActivePage,
  selectChunksRowsForActivePage,
  selectChunksStatusForActivePage,
  selectChunksTotalForActivePage,
} from "../state/selectors";
import {
  setActivePage,
  setPendingScrollPage,
  setScrollSource,
} from "../state/pdfStudioSlice";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import { fetchChunksForPage } from "../state/thunks";
import type { ApiChunkRow } from "../state/types";

interface PdfStudioChunksPaneProps {
  docId: string;
  activePage: number | null;
  hasCldFile: boolean;
  onOpenChunkedRuns: () => void;
  onClose?: () => void;
  /** Active in-document RAG search — while it has run, this pane shows the
   *  ranked hits (with matched-page jump chips) instead of the page chunks. */
  search?: UseDocumentSearch;
  /** Clear the search and return to the per-page chunk list. */
  onClearSearch?: () => void;
}

export function PdfStudioChunksPane({
  docId,
  activePage,
  hasCldFile,
  onOpenChunkedRuns,
  onClose,
  search,
  onClearSearch,
}: PdfStudioChunksPaneProps) {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectChunksStatusForActivePage);
  const rows = useAppSelector(selectChunksRowsForActivePage);
  const total = useAppSelector(selectChunksTotalForActivePage);
  const error = useAppSelector(selectChunksErrorForActivePage);

  useEffect(() => {
    if (!docId || activePage == null) return;
    dispatch(fetchChunksForPage(docId, activePage));
  }, [dispatch, docId, activePage]);

  const jumpToResultPage = (target: number) => {
    dispatch(setScrollSource("chunks"));
    dispatch(setActivePage(target));
    dispatch(setPendingScrollPage(target));
  };

  const handleChunkClick = (chunk: ApiChunkRow) => {
    const target = chunk.page_numbers?.[0];
    if (target == null) return;
    jumpToResultPage(target);
  };

  // Search-results mode — the same summary + ranked list the RAG library
  // viewer renders, scoped to this pane.
  const searchActive = Boolean(search && (search.hasSearched || search.loading));
  if (search && searchActive) {
    return (
      <div className="flex flex-col min-h-0 flex-1 border-r last:border-r-0 border-border">
        <div className="shrink-0 px-3 pt-2 pb-1.5">
          <div className="h-7 flex items-center gap-1.5 min-w-0">
            <Search className="w-3 h-3 text-primary shrink-0" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/80 shrink-0">
              Results
            </span>
            <span
              className="min-w-0 truncate text-[10px] text-muted-foreground"
              title={search.activeQuery}
            >
              · “{search.activeQuery}”
            </span>
            {search.loading && (
              <Loader2 className="w-3 h-3 text-muted-foreground/70 animate-spin ml-1 shrink-0" />
            )}
            <div className="ml-auto flex items-center gap-0.5 shrink-0">
              {onClearSearch && (
                <button
                  type="button"
                  onClick={onClearSearch}
                  className="p-0.5 text-muted-foreground/60 hover:text-foreground rounded transition-colors"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="p-0.5 text-muted-foreground/60 hover:text-foreground rounded transition-colors"
                  title="Hide pane"
                >
                  <EyeOff className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>
        <DocumentSearchSummary
          activeQuery={search.activeQuery}
          summary={search.summary}
          loading={search.loading}
          error={search.error}
          activePageNumber={activePage ?? 1}
          onJumpToPage={jumpToResultPage}
        />
        <div className="flex-1 min-h-0">
          <DocumentSearchResultsList
            hits={search.hits}
            activeQuery={search.activeQuery}
            loading={search.loading}
            error={search.error}
            hasSearched={search.hasSearched}
            onJumpToPage={jumpToResultPage}
          />
        </div>
      </div>
    );
  }

  const retry = () => {
    if (activePage != null) {
      dispatch(fetchChunksForPage(docId, activePage, { force: true }));
    }
  };

  // Plain function (not useCallback): the search-results early return above
  // must not sit before any hook. React Compiler memoizes as needed.
  const buildCopyText = () =>
    rows
      .map((r) => r.content_text ?? "")
      .filter(Boolean)
      .join("\n\n---\n\n");

  return (
    <div className="flex flex-col min-h-0 flex-1 border-r last:border-r-0 border-border">
      <PaneHeader
        activePage={activePage}
        total={total}
        rowCount={rows.length}
        status={status}
        onClose={onClose}
        onCopyAll={rows.length > 0 ? buildCopyText : undefined}
      />
      <div className="flex-1 min-h-0">
        {status === "loading" && rows.length === 0 ? (
          <LoadingState />
        ) : status === "error" ? (
          <ErrorState error={error} onRetry={retry} />
        ) : rows.length === 0 ? (
          <EmptyState
            hasCldFile={hasCldFile}
            activePage={activePage}
            onOpenChunkedRuns={onOpenChunkedRuns}
          />
        ) : (
          <ChunksList rows={rows} total={total} onClick={handleChunkClick} />
        )}
      </div>
    </div>
  );
}

function PaneHeader({
  activePage,
  rowCount,
  total,
  status,
  onClose,
  onCopyAll,
}: {
  activePage: number | null;
  rowCount: number;
  total: number;
  status: string;
  onClose?: () => void;
  onCopyAll?: () => string;
}) {
  const hasActions = !!(onCopyAll || onClose);
  return (
    // Canonical studio sub-header row — matches every other column's top
    // row (px-3 pt-2 pb-1.5 / h-7, no border).
    <div className="shrink-0 px-3 pt-2 pb-1.5">
      <div className="h-7 flex items-center gap-1.5">
        <Boxes className="w-3 h-3 text-primary" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/80">
          {RAG_VOCAB.segmentsShort}
        </span>
        {activePage != null && (
          <span className="text-[10px] text-muted-foreground">
            · Page {activePage}
            {total > 0 &&
              ` · ${rowCount}${total > rowCount ? `/${total}` : ""}`}
          </span>
        )}
        {status === "loading" && (
          <Loader2 className="w-3 h-3 text-muted-foreground/70 animate-spin ml-1" />
        )}
        {hasActions && (
          <div className="ml-auto flex items-center gap-0.5">
            {onCopyAll && (
              <CopyButton
                getText={onCopyAll}
                label={`Copy all ${RAG_VOCAB.segmentsShort.toLowerCase()}`}
              />
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-0.5 text-muted-foreground/60 hover:text-foreground rounded transition-colors"
                title="Hide pane"
              >
                <EyeOff className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CopyButton({
  getText,
  label,
}: {
  getText: () => string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);
  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(getText());
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // ignore clipboard permission denials
      }
    },
    [getText],
  );
  return (
    <button
      type="button"
      onClick={handleClick}
      title={label}
      aria-label={label}
      className={
        copied
          ? "p-0.5 rounded transition-colors text-emerald-500"
          : "p-0.5 rounded transition-colors text-muted-foreground/60 hover:text-foreground hover:bg-accent"
      }
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

function LoadingState() {
  return (
    <div className="p-3 space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-16 w-full rounded bg-muted/40 animate-pulse"
        />
      ))}
    </div>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="p-4 flex flex-col items-start gap-2">
      <div className="flex items-center gap-1.5 text-destructive">
        <AlertCircle className="w-3.5 h-3.5" />
        <span className="text-xs font-medium">
          Couldn't load {RAG_VOCAB.segmentsShort.toLowerCase()}
        </span>
      </div>
      {error && (
        <p className="text-[11px] text-muted-foreground leading-snug">
          {error}
        </p>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={onRetry}
        className="h-7 text-[10px]"
      >
        <RefreshCw className="w-3 h-3 mr-1" />
        Retry
      </Button>
    </div>
  );
}

function EmptyState({
  hasCldFile,
  activePage,
  onOpenChunkedRuns,
}: {
  hasCldFile: boolean;
  activePage: number | null;
  onOpenChunkedRuns: () => void;
}) {
  return (
    <div className="p-4 flex flex-col items-start gap-3">
      <div>
        <p className="text-xs font-medium text-foreground">
          {activePage != null
            ? `No ${RAG_VOCAB.segmentsShort.toLowerCase()} for page ${activePage}.`
            : `No ${RAG_VOCAB.segmentsShort.toLowerCase()} yet.`}
        </p>
        <p className="text-[11px] text-muted-foreground leading-snug mt-1">
          {hasCldFile
            ? `Create a chunking run to break this document into searchable ${RAG_VOCAB.segmentsShort.toLowerCase()}.`
            : "Chunking needs a cld_file source — this document doesn't have one linked."}
        </p>
      </div>
      {hasCldFile && (
        <Button
          size="sm"
          onClick={onOpenChunkedRuns}
          className="h-7 text-[10px]"
        >
          Create a chunking run
        </Button>
      )}
    </div>
  );
}

function ChunksList({
  rows,
  total,
  onClick,
}: {
  rows: ApiChunkRow[];
  total: number;
  onClick: (chunk: ApiChunkRow) => void;
}) {
  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-2">
        {rows.map((c) => (
          <ChunkCard key={c.id} chunk={c} onClick={() => onClick(c)} />
        ))}
        {total > rows.length && (
          <p className="text-[10px] text-muted-foreground italic px-1">
            Showing first {rows.length} of {total.toLocaleString()}.
          </p>
        )}
      </div>
    </ScrollArea>
  );
}

function ChunkCard({
  chunk,
  onClick,
}: {
  chunk: ApiChunkRow;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left border border-border rounded-md p-2 space-y-1 bg-card hover:bg-accent/40 transition-colors",
      )}
      title="Jump to first page of this chunk"
    >
      <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
        <Badge variant="outline" className="text-[10px] px-1 py-0">
          #{chunk.chunk_index ?? "?"}
        </Badge>
        {chunk.chunk_kind && (
          <Badge variant="outline" className="text-[10px] px-1 py-0">
            {chunk.chunk_kind}
          </Badge>
        )}
        {chunk.token_count != null && (
          <Badge variant="outline" className="text-[10px] px-1 py-0">
            {chunk.token_count} tok
          </Badge>
        )}
        {chunk.section_kind && (
          <Badge variant="info" className="text-[10px] px-1 py-0">
            {chunk.section_kind}
          </Badge>
        )}
        {chunk.page_numbers && chunk.page_numbers.length > 0 && (
          <Badge variant="outline" className="text-[10px] px-1 py-0">
            {chunk.page_numbers.length === 1 ? "Page" : "Pages"}{" "}
            {chunk.page_numbers.join(", ")}
          </Badge>
        )}
        {chunk.has_oai_embedding ? (
          <Badge variant="success" className="text-[10px] px-1 py-0">
            embed ✓
          </Badge>
        ) : (
          <Badge variant="error" className="text-[10px] px-1 py-0">
            no embed
          </Badge>
        )}
      </div>
      <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed font-sans">
        {chunk.content_text}
      </pre>
    </button>
  );
}
