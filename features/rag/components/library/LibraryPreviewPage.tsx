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

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookMarked, GitFork, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { EntityModeHeader } from "@/features/shell/components/header/templates/EntityModeHeader";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, buildPath } from "@/lib/api/typed-client";
import type { components } from "@/types/python-generated/api-types";
import { useOpenDiffViewerWindow } from "@/features/overlays/openers/diffViewerWindow";
import { computeMatches } from "@/features/notes/utils/findMatches";
import { HighlightedText } from "@/components/text/HighlightedText";
import { forkProcessedDocument } from "@/features/rag/api/fork";
import { StatusBadge } from "./StatusBadge";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import { useLibraryDoc } from "@/features/rag/hooks/useLibrary";
import { useFilesLibraryProvenance } from "@/features/rag/hooks/useLibraryProvenance";
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
import { PageContentHeader } from "./PageContentHeader";

// Full-page payload — DERIVED from the generated contract (never hand-mirrored).
type ApiFullPage = components["schemas"]["LibraryFullPage"];

/** Shared column-header band so Pages / Segments / Page-text headers line up. */
const COLUMN_HEADER = "flex h-9 shrink-0 items-center border-b px-2";

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
  /** Open the Knowledge Asset Builder drawer on mount (`?assets=1` deep link,
   *  and the file-menu "Knowledge assets" entry). */
  initialAssetsOpen?: boolean;
  /** Host-driven in-document search (e.g. the chat drawer's header pill).
   *  Bump `nonce` per submission — the viewer runs the search and jumps to
   *  the first matching page, exactly like its own bar. */
  externalSearch?: { query: string; nonce: number } | null;
  /** Drop the internal search bar — for hosts that surface search in their
   *  own chrome (pair with `externalSearch`). Summary + results still render. */
  hideSearchBar?: boolean;
}

export function LibraryPreviewPage({
  documentId,
  embedded = false,
  initialPageNumber,
  initialAssetsOpen = false,
  externalSearch,
  hideSearchBar = false,
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
  const [assetsOpen, setAssetsOpen] = useState(initialAssetsOpen);

  // In-document search — lifted to the viewer so one query drives the page-text
  // highlights, the summary banner, the per-page match stepper, and the ranked
  // results list at once.
  const search = useDocumentSearch(documentId);

  // Shared-library grant provenance for the status band — the /files/f/[id]
  // redirect for grant readers lands HERE, so this is where "why can I read
  // this?" must be answered ("Shared library · via <industry>").
  const provenanceFileIds = useMemo(
    () => (doc?.sourceId ? [doc.sourceId] : []),
    [doc?.sourceId],
  );
  const { labelByFile: provenanceByFile } =
    useFilesLibraryProvenance(provenanceFileIds);
  const provenanceLabel = doc?.sourceId
    ? (provenanceByFile.get(doc.sourceId) ?? null)
    : null;

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

  // Host-driven search submissions (chat-drawer header pill). Each nonce bump
  // seeds the query and runs the same flow as the internal bar; an empty query
  // clears. Render-time prev-value pattern for the nonce guard.
  const { setQuery, clear } = search;
  const extNonce = externalSearch?.nonce ?? null;
  const [seenExtNonce, setSeenExtNonce] = useState(extNonce);
  useEffect(() => {
    if (extNonce === null || extNonce === seenExtNonce) return;
    setSeenExtNonce(extNonce);
    const q = externalSearch?.query.trim() ?? "";
    if (!q) {
      clear();
      return;
    }
    setQuery(q);
    void run(q).then((matchedPages) => {
      setActivePageIndex((cur) =>
        matchedPages.length > 0 && !matchedPages.includes(cur + 1)
          ? matchedPages[0] - 1
          : cur,
      );
    });
  }, [extNonce, seenExtNonce, externalSearch, setQuery, clear, run]);

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
      toast.error(
        e instanceof Error ? e.message : "Could not create your copy",
      );
      setForking(false);
    }
  };

  return (
    <div className="relative flex flex-col bg-background h-full">
      {!embedded && (
        <EntityModeHeader
          backHref="/rag/library"
          entityLabel={docLoading || !doc ? "Loading…" : doc.name}
          actions={
            doc
              ? [
                  {
                    label: "Knowledge Assets",
                    icon: Sparkles,
                    onPress: () => setAssetsOpen(true),
                  },
                  {
                    label: "Make my copy",
                    icon: GitFork,
                    onPress: () => void handleFork(),
                    disabled: forking,
                  },
                ]
              : []
          }
        />
      )}
      <div
        className={cn(
          "flex-1 min-h-0 flex flex-col",
          !embedded && "pt-[var(--shell-header-h)]",
        )}
      >
        {!embedded && doc && (
          <div className="border-b px-4 py-1.5 flex items-center gap-2 min-w-0 shrink-0">
            <StatusBadge status={(doc.status as DocStatus) ?? "unknown"} />
            {provenanceLabel && (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"
                title="You can read this document through a shared-knowledge grant"
              >
                <BookMarked className="h-3 w-3" />
                {provenanceLabel}
              </span>
            )}
            <span className="text-xs text-muted-foreground whitespace-nowrap truncate">
              {doc.pagesPersisted} pages · {doc.chunks}{" "}
              {RAG_VOCAB.segmentsShort.toLowerCase()} · {doc.embeddingsOai}{" "}
              embeds
            </span>
          </div>
        )}

        {/* In-document search — present in both modes. In embedded surfaces (the
          /files Knowledge tab) the document header is dropped, so the Knowledge
          Assets entry rides along as the bar's trailing slot instead of a
          floating button. */}
        {doc && !docError && (
          <>
            {!hideSearchBar && (
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
                      Knowledge Assets
                    </Button>
                  ) : undefined
                }
              />
            )}
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
      </div>

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
      <div
        className={cn(
          COLUMN_HEADER,
          "px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
        )}
      >
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
    apiGet(
      buildPath("/rag/library/{processed_document_id}/page/{page_index}", {
        processed_document_id: documentId,
        page_index: pageIndex,
      }),
    )
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

  const pageLabel =
    page?.section_title?.trim() ||
    page?.section_kind?.trim() ||
    `Page ${pageIndex + 1}`;

  return (
    <div className="flex flex-col min-h-0 min-w-0">
      <PageContentHeader
        pageLabel={pageLabel}
        loading={loading && !page}
        pageIndex={pageIndex}
        totalPages={totalPages}
        onPageChange={onPageChange}
        query={query}
        matchesCount={matches.length}
        activeMatch={activeMatch}
        onStepMatch={stepMatch}
        tab={tab}
        onTabChange={setTab}
        canCompare={Boolean(page?.raw_text && page?.cleaned_text)}
        onCompare={handleCompare}
      />

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

  const resultCount = search.hits?.length;

  return (
    <div className="flex flex-col min-h-0">
      <div className={COLUMN_HEADER}>
        <div
          role="tablist"
          aria-label="Segments and search results"
          className="grid w-full grid-cols-2 rounded-md bg-muted p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "chunks"}
            onClick={() => setTab("chunks")}
            className={cn(
              "h-7 truncate rounded-sm px-2 text-xs font-medium transition-colors",
              tab === "chunks"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {RAG_VOCAB.segmentsShort} (P.{activePageNumber})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "results"}
            onClick={() => setTab("results")}
            className={cn(
              "h-7 truncate rounded-sm px-2 text-xs font-medium transition-colors",
              tab === "results"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Results{resultCount != null ? ` (${resultCount})` : ""}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {tab === "chunks" ? (
          <ChunksOnPage documentId={documentId} pageNumber={activePageNumber} />
        ) : (
          <DocumentSearchResultsList
            hits={search.hits}
            activeQuery={search.activeQuery}
            loading={search.loading}
            error={search.error}
            hasSearched={search.hasSearched}
            onJumpToPage={onJumpToPage}
          />
        )}
      </div>
    </div>
  );
}
