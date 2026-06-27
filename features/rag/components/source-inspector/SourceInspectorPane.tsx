"use client";

/**
 * SourceInspectorPane — the body of the Source Inspector window.
 *
 * A retrieved citation is only trustworthy if the user can land on the EXACT
 * place it came from and see everything the platform extracted there. Given a
 * RAG hit (`source_kind` + `source_id` + `page_number(s)` + `chunk_id`), this
 * pane:
 *   - resolves the file ↔ processed-document identity (the PDF bridge),
 *   - renders the real PDF AT THE EXACT PAGE (controlled `pageNumber`),
 *   - and unifies, in synced tabs that follow the page, everything anchored to
 *     it: the matched chunk (highlighted among its page siblings), the page's
 *     RAW extraction text, the CLEAN text, and any page-level extractions/tables.
 *
 * Composes the canonical parts — `PdfPreview`, `usePdfSurfaceLinks`,
 * `usePageBundle`, `ChunksOnPage`, `ExtractionsPane` — never forks them.
 */

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Crosshair,
  ExternalLink,
  Loader2,
  FileText,
  BookOpenText,
  AlignLeft,
  Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFileNode, InlineMediaRef } from "@/features/files";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import { usePdfSurfaceLinks } from "@/features/pdf/hooks/usePdfSurfaceLinks";
import { ChunksOnPage } from "@/features/rag/components/library/ChunkList";
import { ExtractionsPane } from "@/features/page-extraction/components/ExtractionsPane";
import { usePageBundle } from "./usePageBundle";

// react-pdf is heavy — keep it out of the inspector chunk until a PDF is shown.
const PdfPreview = dynamic(
  () => import("@/features/pdf/components/viewer/PdfPreview"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    ),
  },
);

export interface SourceInspectorPaneProps {
  sourceKind: string;
  /** cld_file → file_id; library_doc → processed_document_id; else opaque. */
  sourceId: string;
  chunkId: string | null;
  pageNumber: number | null;
  pageNumbers: number[] | null;
  snippet: string | null;
  fileName: string | null;
  score: number | null;
  query: string | null;
  /** Canonical citation deep-link for "Open source" (carries chunk + page). */
  href: string | null;
}

type TabKey = "match" | "clean" | "raw" | "extractions";

export function SourceInspectorPane({
  sourceKind,
  sourceId,
  chunkId,
  pageNumber,
  pageNumbers,
  snippet,
  fileName,
  score,
  query,
  href,
}: SourceInspectorPaneProps) {
  const isMobile = useIsMobile();

  const isCldFile = sourceKind === "cld_file";
  const isLibrary = sourceKind === "library_doc";

  // Resolve both identities. cld_file gives us the file_id; library_doc gives us
  // the processed_document_id; the bridge fills the other side.
  const { ids } = usePdfSurfaceLinks(
    isCldFile
      ? { fileId: sourceId }
      : isLibrary
        ? { processedDocumentId: sourceId }
        : {},
  );
  const fileId = ids.fileId;
  const processedDocumentId = ids.processedDocumentId;
  const hasDoc = Boolean(processedDocumentId);

  // The page(s) the citation anchors to.
  const matchPages = useMemo(() => {
    const raw =
      pageNumbers && pageNumbers.length
        ? pageNumbers
        : pageNumber != null
          ? [pageNumber]
          : [];
    return [...new Set(raw)].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  }, [pageNumbers, pageNumber]);
  // Pages are 1-based on the wire; clamp so a stray 0/negative can't feed the
  // 1-based PDF viewer or the page-content query (review P2).
  const targetPage = Math.max(1, matchPages[0] ?? 1);

  const [activePage, setActivePage] = useState(targetPage);

  // Is the source a renderable PDF? (mime / filename hint; falls back to false
  // so a non-PDF never feeds garbage to pdfjs.)
  const { file } = useFileNode(fileId ?? "");
  const isPdf = useMemo(() => {
    const name = file?.fileName ?? fileName ?? "";
    const mime = file?.mimeType ?? null;
    return mime === "application/pdf" || /\.pdf$/i.test(name);
  }, [file?.fileName, file?.mimeType, fileName]);
  const showViewer = isPdf && Boolean(fileId);

  const { page, loading: pageLoading } = usePageBundle({
    processedDocumentId,
    pageNumber: activePage,
    enabled: hasDoc,
  });
  // Decoupled into its own primitive: feeding `page.imageCldFileId` straight to
  // InlineMediaRef's `ref` prop makes the React Compiler treat all of `page` as
  // a ref (then flags every `page.cleanedText` read). A standalone const breaks
  // that taint.
  const pageImageId = page?.imageCldFileId ?? null;

  const [tab, setTab] = useState<TabKey>("match");

  const spanLabel =
    matchPages.length === 0
      ? null
      : matchPages.length === 1
        ? `Page ${matchPages[0]}`
        : `Pages ${matchPages[0]}–${matchPages[matchPages.length - 1]}`;
  const onMatchPage = matchPages.includes(activePage) || matchPages.length === 0;

  // ── Visual pane (the real document) ──────────────────────────────────────
  const visual = showViewer ? (
    <PdfPreview
      fileId={fileId!}
      pageNumber={activePage}
      onPageChange={setActivePage}
      className="h-full w-full"
    />
  ) : pageImageId ? (
    <ScrollArea className="h-full w-full bg-muted/30">
      <div className="flex justify-center p-3">
        <InlineMediaRef
          ref={pageImageId}
          size={{ width: 700, height: 900 }}
          fit="contain"
          rounded="md"
          border="subtle"
        />
      </div>
    </ScrollArea>
  ) : null;

  // ── Tabs (everything anchored to this page) ──────────────────────────────
  const tabs = (
    <div className="flex h-full min-h-0 flex-col">
      {/* tab bar */}
      <div className="flex shrink-0 items-center gap-0.5 border-b border-border bg-muted/30 px-1.5 py-1">
        <TabButton
          active={tab === "match"}
          onClick={() => setTab("match")}
          icon={Crosshair}
          label="Match"
        />
        {hasDoc ? (
          <>
            <TabButton
              active={tab === "clean"}
              onClick={() => setTab("clean")}
              icon={BookOpenText}
              label="Clean text"
            />
            <TabButton
              active={tab === "raw"}
              onClick={() => setTab("raw")}
              icon={AlignLeft}
              label="Raw text"
            />
            <TabButton
              active={tab === "extractions"}
              onClick={() => setTab("extractions")}
              icon={Table2}
              label="Extractions"
            />
          </>
        ) : null}
      </div>

      {/* tab body */}
      <div className="min-h-0 flex-1">
        {tab === "match" ? (
          <div className="flex h-full min-h-0 flex-col">
            {(score != null || query) && (
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-1.5 text-xs">
                {score != null ? (
                  <span className="rounded-md bg-muted px-1.5 py-0.5 font-semibold tabular-nums text-foreground">
                    score {score.toFixed(3)}
                  </span>
                ) : null}
                {query ? (
                  <span className="min-w-0 truncate text-muted-foreground">
                    for “{query}”
                  </span>
                ) : null}
              </div>
            )}
            <div className="min-h-0 flex-1">
              {hasDoc && processedDocumentId ? (
                <ChunksOnPage
                  documentId={processedDocumentId}
                  pageNumber={activePage}
                  highlightChunkId={onMatchPage ? chunkId : null}
                />
              ) : (
                <ScrollArea className="h-full">
                  <div className="p-3">
                    {snippet ? (
                      <div className="rounded-md border border-primary/50 bg-primary/[0.06] p-2.5 text-xs leading-relaxed text-foreground ring-1 ring-primary/20">
                        <Badge className="mb-1.5 text-[10px]">Matched</Badge>
                        <p className="whitespace-pre-wrap break-words">
                          {snippet}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No preview available for this source.
                      </p>
                    )}
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Full page extraction isn&apos;t available for this source
                      type.
                    </p>
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>
        ) : null}

        {tab === "clean" ? (
          <ScrollArea className="h-full">
            <div className="p-3">
              <PageTextState loading={pageLoading} empty={!page?.cleanedText}>
                <BasicMarkdownContent content={page?.cleanedText ?? ""} />
              </PageTextState>
            </div>
          </ScrollArea>
        ) : null}

        {tab === "raw" ? (
          <ScrollArea className="h-full">
            <div className="p-3">
              <PageTextState loading={pageLoading} empty={!page?.rawText}>
                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
                  {page?.rawText}
                </pre>
              </PageTextState>
            </div>
          </ScrollArea>
        ) : null}

        {/* Lazy: only mount ExtractionsPane (realtime + job hydration) when viewed. */}
        {tab === "extractions" ? (
          <div className="h-full min-h-0">
            <ExtractionsPane
              fileId={fileId}
              processedDocumentId={processedDocumentId}
              activePage={activePage}
              onJumpToPage={setActivePage}
            />
          </div>
        ) : null}
      </div>
    </div>
  );

  // ── Toolbar ──────────────────────────────────────────────────────────────
  const toolbar = (
    <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-1.5">
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="truncate text-sm font-medium text-foreground">
        {fileName ?? "Source"}
      </span>
      {spanLabel ? (
        <span
          className={cn(
            "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
            onMatchPage
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          {onMatchPage ? spanLabel : `Page ${activePage}`}
        </span>
      ) : null}
      {!onMatchPage ? (
        <button
          type="button"
          onClick={() => setActivePage(targetPage)}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
        >
          <Crosshair className="h-3.5 w-3.5" />
          Jump to match
        </button>
      ) : null}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open source
          </a>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-background">
      {toolbar}
      <div className="min-h-0 flex-1">
        {!visual ? (
          tabs
        ) : isMobile ? (
          <div className="flex h-full flex-col">
            <div className="h-[42vh] shrink-0 border-b border-border">
              {visual}
            </div>
            <div className="min-h-0 flex-1">{tabs}</div>
          </div>
        ) : (
          <ResizablePanelGroup orientation="horizontal" className="h-full">
            <ResizablePanel
              defaultSize={56}
              minSize={30}
              style={{ overflow: "hidden", height: "100%" }}
            >
              {visual}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
              defaultSize={44}
              minSize={28}
              style={{ overflow: "hidden", height: "100%" }}
            >
              {tabs}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Crosshair;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function PageTextState({
  loading,
  empty,
  children,
}: {
  loading: boolean;
  empty: boolean;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading page…
      </div>
    );
  }
  if (empty) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <FileText className="h-4 w-4" />
        Nothing extracted for this page.
      </div>
    );
  }
  return <>{children}</>;
}
