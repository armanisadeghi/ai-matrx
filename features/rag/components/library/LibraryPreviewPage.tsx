"use client";

/**
 * /rag/library/[id]/preview — robust 3-pane document preview.
 *
 * Why this exists:
 *   The existing /rag/viewer/[id] is a 4-pane PDF + raw + cleaned + chunks
 *   layout that depends on react-pdf, the page-image renderer, and a
 *   bundle of /api/document/* endpoints — any one of which can fail and
 *   leave the user staring at an error. The user explicitly said the
 *   viewer is broken.
 *
 *   This page is the "always works" preview. It uses ONLY the /rag/library/*
 *   endpoints I built and tested. Three columns:
 *     - Left: page list (jump targets)
 *     - Middle: cleaned markdown of the active page
 *     - Right: chunks for the active page + a test-search box
 *
 *   No PDF rendering, no react-pdf, no /api/document/* dependency. Just
 *   data + Tailwind.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  GitCompareArrows,
  GitFork,
  Loader2,
  Search as SearchIcon,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getJson } from "@/lib/python-client";
import { useOpenDiffViewerWindow } from "@/features/overlays/openers/diffViewerWindow";
import { computeMatches } from "@/features/notes/utils/findMatches";
import { HighlightedText } from "@/components/text/HighlightedText";
import { forkProcessedDocument } from "@/features/rag/api/fork";
import { StatusBadge } from "./StatusBadge";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import { useLibraryDoc } from "@/features/rag/hooks/useLibrary";
import {
  useDocumentSearch,
  type UseDocumentSearch,
} from "@/features/rag/hooks/useDocumentSearch";
import {
  DocumentSearchBar,
  DocumentSearchSummary,
  DocumentSearchResultsList,
} from "./DocumentSearch";
import type { DocStatus } from "@/features/rag/types/library";
import { ChunksOnPage } from "./ChunkList";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { KnowledgeAssetPanel } from "./KnowledgeAssetPanel";

interface ApiFullPage {
  page_index: number;
  page_number: number;
  raw_text: string;
  raw_char_count: number;
  cleaned_text: string;
  cleaned_char_count: number;
  extraction_method: string | null;
  used_ocr: boolean;
  section_kind: string | null;
  section_title: string | null;
  is_continuation: boolean;
  has_image: boolean;
}

export interface LibraryPreviewPageProps {
  documentId: string;
  /** When true, drop the header chrome and use h-full instead of
   *  h-[calc(100dvh-3rem)] so the viewer can be embedded inside other
   *  surfaces (e.g. the /files Document tab). */
  embedded?: boolean;
  /** Deep-link landing page (1-based), e.g. from a search citation
   *  `/rag/viewer/<id>?page=12`. The viewer opens on this page instead of
   *  page 1 so clicking a hit lands the user on the passage. */
  initialPageNumber?: number;
}

export function LibraryPreviewPage({
  documentId,
  embedded = false,
  initialPageNumber,
}: LibraryPreviewPageProps) {
  const {
    doc,
    loading: docLoading,
    error: docError,
  } = useLibraryDoc(documentId);
  const [activePageIndex, setActivePageIndex] = useState(
    initialPageNumber && initialPageNumber > 0 ? initialPageNumber - 1 : 0,
  );
  const router = useRouter();
  const [forking, setForking] = useState(false);
  // Knowledge Assets drawer — opens the builder alongside (not over) the doc,
  // so pages + text stay visible behind the resizable panel.
  const [assetsOpen, setAssetsOpen] = useState(false);

  // In-document search — lifted to the viewer so one query drives the page-text
  // highlights, the summary banner, the per-page match stepper, and the ranked
  // results list at once.
  const search = useDocumentSearch(documentId);

  const jumpToPage = useCallback((pageNumber: number) => {
    setActivePageIndex(Math.max(0, pageNumber - 1));
  }, []);

  // Run the search, then land on the first page that contains the term so
  // highlights are visible immediately (unless the current page already
  // matched). Driven by the returned page list — no reactive effect needed.
  const { run } = search;
  const handleSearch = useCallback(async () => {
    const matchedPages = await run();
    setActivePageIndex((cur) =>
      matchedPages.length > 0 && !matchedPages.includes(cur + 1)
        ? matchedPages[0] - 1
        : cur,
    );
  }, [run]);

  // "Make my copy" — fork this (read-only) shared document into a user-owned
  // copy and open it in the studio, where the user can run their own agents /
  // segmentation. Get-or-create on the server, so re-clicking is safe.
  const handleFork = async () => {
    if (forking) return;
    setForking(true);
    try {
      const newId = await forkProcessedDocument(documentId);
      toast.success("Created your editable copy");
      router.push(`/tools/pdf-extractor/${newId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create your copy");
      setForking(false);
    }
  };

  return (
    <div
      className={
        "relative flex flex-col bg-background " +
        (embedded ? "h-full" : "h-[calc(100dvh-3rem)]")
      }
    >
      {!embedded && (
        <header className="border-b px-4 py-3 flex items-center gap-3">
          <Link href="/rag/library">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Library
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            {docLoading || !doc ? (
              <Skeleton className="h-5 w-64" />
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-sm font-semibold break-words">
                  {doc.name}
                </h1>
                <StatusBadge status={(doc.status as DocStatus) ?? "unknown"} />
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {doc.pagesPersisted} pages · {doc.chunks}{" "}
                  {RAG_VOCAB.segmentsShort.toLowerCase()} · {doc.embeddingsOai}{" "}
                  embeds
                </span>
              </div>
            )}
          </div>
          {doc && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAssetsOpen(true)}
                title="Build premium knowledge representations (table rows, figure captions, summaries, Q&A) from this document"
              >
                <Sparkles className="h-4 w-4 mr-1 text-primary" />
                Knowledge Assets
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleFork}
                disabled={forking}
                title="Fork this shared document into your own editable copy you can re-process with your own agents"
              >
                {forking ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <GitFork className="h-4 w-4 mr-1" />
                )}
                Make my copy
              </Button>
            </>
          )}
        </header>
      )}

      {/* In-document search — present in both modes. In embedded surfaces (the
          /files Knowledge tab) the document header is dropped, so the Knowledge
          Assets entry rides along as the bar's trailing slot instead of a
          floating button. */}
      {doc && !docError && (
        <>
          <DocumentSearchBar
            query={search.query}
            onQueryChange={search.setQuery}
            onSubmit={handleSearch}
            onClear={search.clear}
            loading={search.loading}
            hasSearched={search.hasSearched}
            summary={search.summary}
            rightSlot={
              embedded ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAssetsOpen(true)}
                  className="h-7 px-2 text-xs shrink-0"
                  title="Build premium knowledge representations from this document"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1 text-primary" />
                  Knowledge Assets
                </Button>
              ) : undefined
            }
          />
          {search.hasSearched && (
            <DocumentSearchSummary
              activeQuery={search.activeQuery}
              summary={search.summary}
              loading={search.loading}
              error={search.error}
              activePageNumber={activePageIndex + 1}
              onJumpToPage={jumpToPage}
            />
          )}
        </>
      )}

      {docError && (
        <div className="m-4 p-3 border border-destructive/50 bg-destructive/5 rounded-md text-sm text-destructive">
          <strong>Could not load document:</strong> {docError}
        </div>
      )}

      {!docError && (
        // `minmax(0, 1fr)` (instead of bare `1fr`) is critical here:
        // CSS Grid defaults the third track to `minmax(auto, 1fr)`,
        // which lets the column grow past the available space when the
        // page content has long unbroken text. With `minmax(0, 1fr)`
        // the column hard-caps at the remaining viewport width and the
        // inner `<pre>` wraps as expected.
        <div className="flex-1 min-h-0 grid grid-cols-[220px_360px_minmax(0,1fr)] divide-x overflow-hidden">
          {/* Left: pages list */}
          <PagesNav
            documentId={documentId}
            totalPages={doc?.pagesPersisted ?? 0}
            activePageIndex={activePageIndex}
            onSelect={setActivePageIndex}
            seedPages={doc?.pages ?? []}
          />

          {/* Middle: per-page segments + ranked search results — sits next to
              Pages so the user sees the page-by-page breakdown directly
              alongside the page list, without the wide page-text panel in
              between. */}
          <RightRail
            documentId={documentId}
            activePageNumber={activePageIndex + 1}
            search={search}
            onJumpToPage={jumpToPage}
          />

          {/* Right: page text — gets the remaining 1fr and is the place to
              read the cleaned / raw text of the active page, with the active
              search term highlighted in place. */}
          <PageContent
            documentId={documentId}
            pageIndex={activePageIndex}
            totalPages={doc?.pagesPersisted ?? 0}
            onPageChange={setActivePageIndex}
            query={search.activeQuery}
          />
        </div>
      )}

      {/* Knowledge Asset Builder — resizable right drawer. The doc stays fully
          visible behind it (the panel sits alongside, not over), so the user
          reads the source while building / inspecting representations. */}
      {doc && (
        <MatrxDynamicPanelHost
          open={assetsOpen}
          onOpenChange={setAssetsOpen}
          title="Knowledge Assets"
          description={doc.name}
          position="right"
          defaultSize={46}
          minSize={28}
          maxSize={80}
          contentClassName="p-0"
        >
          <KnowledgeAssetPanel
            doc={{
              id: documentId,
              name: doc.name,
              totalPages: doc.pagesPersisted ?? null,
            }}
          />
        </MatrxDynamicPanelHost>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Left rail — pages list
// ---------------------------------------------------------------------------

function PagesNav({
  documentId: _documentId,
  totalPages,
  activePageIndex,
  onSelect,
  seedPages,
}: {
  documentId: string;
  totalPages: number;
  activePageIndex: number;
  onSelect: (idx: number) => void;
  seedPages: {
    pageIndex: number;
    pageNumber: number;
    sectionKind: string | null;
    sectionTitle: string | null;
  }[];
}) {
  // Use the seedPages summary from the detail endpoint as the page index.
  // For docs with > 25 pages we still let users jump by number via the
  // PageContent's input field; the left list shows the first 25 plus
  // the active page if it's beyond that range.
  const pages = useMemo(() => {
    const list = [...seedPages];
    if (
      activePageIndex < totalPages &&
      !list.some((p) => p.pageIndex === activePageIndex)
    ) {
      list.push({
        pageIndex: activePageIndex,
        pageNumber: activePageIndex + 1,
        sectionKind: null,
        sectionTitle: null,
      });
    }
    list.sort((a, b) => a.pageIndex - b.pageIndex);
    return list;
  }, [seedPages, activePageIndex, totalPages]);

  return (
    <div className="flex flex-col min-h-0">
      <div className="px-3 py-2 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Pages ({totalPages})
      </div>
      <ScrollArea className="flex-1">
        <ul className="divide-y">
          {pages.map((p) => (
            <li key={p.pageIndex}>
              <button
                onClick={() => onSelect(p.pageIndex)}
                className={
                  "w-full text-left px-3 py-2 text-sm hover:bg-accent/50 transition-colors " +
                  (p.pageIndex === activePageIndex
                    ? "bg-accent text-accent-foreground"
                    : "")
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium tabular-nums">
                    p.{p.pageNumber}
                  </span>
                  {p.sectionKind && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                      {p.sectionKind}
                    </Badge>
                  )}
                </div>
                {p.sectionTitle && (
                  <div className="text-xs text-muted-foreground break-words mt-0.5">
                    {p.sectionTitle}
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
        {pages.length < totalPages && (
          <p className="px-3 py-2 text-xs text-muted-foreground italic">
            Showing index of first {pages.length}; use ⏵ to navigate beyond.
          </p>
        )}
      </ScrollArea>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Middle — selected page content
// ---------------------------------------------------------------------------

function PageContent({
  documentId,
  pageIndex,
  totalPages,
  onPageChange,
  query,
}: {
  documentId: string;
  pageIndex: number;
  totalPages: number;
  onPageChange: (idx: number) => void;
  /** Active search term — literal matches are highlighted in the page text. */
  query: string;
}) {
  const [page, setPage] = useState<ApiFullPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"cleaned" | "raw">("cleaned");
  const [activeMatch, setActiveMatch] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // When there are no persisted pages, the empty-state render below owns the
    // output and `page` is never read — so no synchronous reset is needed here.
    if (totalPages === 0) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getJson<ApiFullPage>(`/rag/library/${documentId}/page/${pageIndex}`)
      .then(({ data }) => {
        if (!cancelled && data) setPage(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? "Failed to load page");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, pageIndex, totalPages]);

  const shownText = useMemo(() => {
    if (!page) return "";
    return tab === "cleaned" ? page.cleaned_text || "" : page.raw_text || "";
  }, [page, tab]);

  // The Cleaned/Raw tabs show one OR the other — never both. Compare opens the
  // canonical diff so the user sees what the LLM cleanup changed. raw=baseline,
  // cleaned=new.
  const openDiff = useOpenDiffViewerWindow();
  const handleCompare = useCallback(() => {
    if (!page?.raw_text || !page?.cleaned_text) return;
    openDiff({
      original: page.raw_text,
      modified: page.cleaned_text,
      originalLabel: "Raw",
      modifiedLabel: "Cleaned",
      title: `Raw vs cleaned · page ${pageIndex + 1}`,
      engine: "light",
      language: "markdown",
      defaultView: "split",
    });
  }, [openDiff, page, pageIndex]);

  // Literal matches in the page text — exactly what the user typed, so the
  // highlight is precise (the server lexical hits power the cross-page summary;
  // this powers the in-place highlighting + the per-page stepper).
  const matches = useMemo(
    () =>
      query
        ? computeMatches(shownText, query, {
            caseSensitive: false,
            useRegex: false,
            wholeWord: false,
          })
        : [],
    [shownText, query],
  );

  // Reset to the first match whenever the navigation context changes (new page
  // / query / cleaned↔raw toggle). Render-time prev-value pattern — the React-
  // recommended alternative to a reset effect.
  const navKey = `${pageIndex}|${tab}|${query}`;
  const [lastNavKey, setLastNavKey] = useState(navKey);
  if (navKey !== lastNavKey) {
    setLastNavKey(navKey);
    setActiveMatch(0);
  }

  // Keep the active match scrolled into view.
  useEffect(() => {
    if (!query || matches.length === 0) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `mark[data-match-index="${activeMatch}"]`,
    );
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeMatch, matches, query]);

  const stepMatch = useCallback(
    (dir: 1 | -1) => {
      setActiveMatch((i) =>
        matches.length === 0 ? 0 : (i + dir + matches.length) % matches.length,
      );
    },
    [matches.length],
  );

  if (totalPages === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
        <AlertCircle className="h-8 w-8 mb-2" />
        <p className="text-sm">
          No pages persisted yet. This usually means ingestion failed before
          extracting any pages — re-process to retry.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0 min-w-0">
      <div className="border-b px-3 py-2 flex items-center gap-2 min-w-0">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onPageChange(Math.max(0, pageIndex - 1))}
          disabled={pageIndex <= 0}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium tabular-nums">
          Page {pageIndex + 1} / {totalPages}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onPageChange(Math.min(totalPages - 1, pageIndex + 1))}
          disabled={pageIndex >= totalPages - 1}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={pageIndex + 1}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            if (Number.isFinite(n) && n >= 1 && n <= totalPages) {
              onPageChange(n - 1);
            }
          }}
          className="ml-2 w-16 h-7 text-xs border rounded px-2 bg-background"
        />

        {/* Match stepper — only while a search is active. Steps through every
            literal occurrence on THIS page; jump across pages from the summary
            chips above. */}
        {query && (
          <div className="flex items-center gap-0.5 shrink-0 rounded-md border bg-card px-1">
            {matches.length > 0 ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={() => stepMatch(-1)}
                  title="Previous match on this page"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <span className="text-[11px] tabular-nums text-muted-foreground px-0.5">
                  {activeMatch + 1}/{matches.length}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={() => stepMatch(1)}
                  title="Next match on this page"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <span className="text-[11px] text-muted-foreground px-1.5 py-0.5 whitespace-nowrap">
                0 on this page
              </span>
            )}
          </div>
        )}

        {page?.section_kind && (
          <Badge variant="info" className="ml-2 shrink-0">
            {page.section_kind}
          </Badge>
        )}
        {page?.used_ocr && (
          <Badge variant="warning" className="shrink-0">
            OCR
          </Badge>
        )}
        {/* Section title: truncate to single line with full text on hover.
            Previously this used `break-words`, which combined with a
            squeezed flex container caused every character to break onto
            its own line ("T / a / b / l / e..."). Truncate is the right
            primitive here. */}
        {page?.section_title && (
          <span
            className="text-xs text-muted-foreground min-w-0 flex-1 truncate"
            title={page.section_title}
          >
            {page.section_title}
          </span>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {page?.raw_text && page?.cleaned_text && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCompare}
              className="h-7 gap-1.5"
              title="Compare the raw extraction with the cleaned text"
            >
              <GitCompareArrows className="h-3.5 w-3.5" />
              Compare
            </Button>
          )}
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as "cleaned" | "raw")}
            className="shrink-0"
          >
            <TabsList className="h-7">
              <TabsTrigger value="cleaned" className="h-6 text-xs">
                Cleaned
              </TabsTrigger>
              <TabsTrigger value="raw" className="h-6 text-xs">
                Raw
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto p-4">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading page…
          </div>
        )}
        {error && (
          <div className="text-sm text-destructive">
            <strong>Error:</strong> {error}
          </div>
        )}
        {!loading && !error && page && (
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
            {shownText ? (
              query ? (
                <HighlightedText
                  text={shownText}
                  matches={matches}
                  activeIndex={activeMatch}
                />
              ) : (
                shownText
              )
            ) : (
              <span className="italic text-muted-foreground">
                {tab === "cleaned"
                  ? "(cleaned text empty — toggle to Raw to see what was extracted)"
                  : "(raw text empty)"}
              </span>
            )}
          </pre>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right rail — segments for the active page + ranked search results
// ---------------------------------------------------------------------------

function RightRail({
  documentId,
  activePageNumber,
  search,
  onJumpToPage,
}: {
  documentId: string;
  activePageNumber: number;
  search: UseDocumentSearch;
  onJumpToPage: (pageNumber: number) => void;
}) {
  const [tab, setTab] = useState<"chunks" | "results">("chunks");

  // Surface the ranked results the moment a search completes. Render-time
  // prev-value pattern — no reset effect.
  const [seenNonce, setSeenNonce] = useState(search.resultNonce);
  if (search.resultNonce !== seenNonce) {
    setSeenNonce(search.resultNonce);
    setTab("results");
  }

  return (
    <div className="flex flex-col min-h-0">
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "chunks" | "results")}
        className="flex-1 flex flex-col min-h-0"
      >
        <div className="border-b px-3 py-2">
          <TabsList className="h-7">
            <TabsTrigger value="chunks" className="h-6 text-xs">
              {RAG_VOCAB.segmentsShort} (this page)
            </TabsTrigger>
            <TabsTrigger value="results" className="h-6 text-xs">
              <SearchIcon className="h-3 w-3 mr-1" />
              Results
              {search.hits ? ` (${search.hits.length})` : ""}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="chunks" className="flex-1 min-h-0 m-0">
          <ChunksOnPage documentId={documentId} pageNumber={activePageNumber} />
        </TabsContent>
        <TabsContent value="results" className="flex-1 min-h-0 m-0">
          <DocumentSearchResultsList
            hits={search.hits}
            activeQuery={search.activeQuery}
            loading={search.loading}
            error={search.error}
            hasSearched={search.hasSearched}
            onJumpToPage={onJumpToPage}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
