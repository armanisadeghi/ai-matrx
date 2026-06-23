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
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  GitFork,
  Loader2,
  Search as SearchIcon,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getJson, postJson } from "@/lib/python-client";
import { forkProcessedDocument } from "@/features/rag/api/fork";
import { StatusBadge } from "./StatusBadge";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import { useLibraryDoc } from "@/features/rag/hooks/useLibrary";
import type { DocStatus } from "@/features/rag/types/library";

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

interface ApiChunkRow {
  id: string;
  chunk_index: number | null;
  chunk_kind: string | null;
  parent_chunk_id: string | null;
  page_numbers: number[] | null;
  token_count: number | null;
  content_text: string;
  has_oai_embedding: boolean;
  has_voyage_embedding: boolean;
  section_kind: string | null;
}

interface ApiChunksResponse {
  chunks: ApiChunkRow[];
  total: number;
  limit: number;
  offset: number;
}

interface ApiTestSearchHit {
  chunk_id: string;
  chunk_index: number | null;
  score: number;
  page_numbers: number[] | null;
  section_kind: string | null;
  content_text: string;
}

interface ApiTestSearchResponse {
  document_id: string;
  query: string;
  hits: ApiTestSearchHit[];
  total_chunks_in_doc: number;
}

export interface LibraryPreviewPageProps {
  documentId: string;
  /** When true, drop the header chrome and use h-full instead of
   *  h-[calc(100dvh-3rem)] so the viewer can be embedded inside other
   *  surfaces (e.g. the /files Document tab). */
  embedded?: boolean;
}

export function LibraryPreviewPage({
  documentId,
  embedded = false,
}: LibraryPreviewPageProps) {
  const {
    doc,
    loading: docLoading,
    error: docError,
  } = useLibraryDoc(documentId);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const router = useRouter();
  const [forking, setForking] = useState(false);

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
        "flex flex-col bg-background " +
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
          )}
        </header>
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

          {/* Middle: chunks + test-search — sits next to Pages so the user
              sees the page-by-page chunk breakdown directly alongside the
              page list, without the wide page-text panel in between. */}
          <RightRail
            documentId={documentId}
            activePageNumber={activePageIndex + 1}
          />

          {/* Right: page text — gets the remaining 1fr and is the place to
              read the cleaned / raw text of the active page. */}
          <PageContent
            documentId={documentId}
            pageIndex={activePageIndex}
            totalPages={doc?.pagesPersisted ?? 0}
            onPageChange={setActivePageIndex}
          />
        </div>
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
}: {
  documentId: string;
  pageIndex: number;
  totalPages: number;
  onPageChange: (idx: number) => void;
}) {
  const [page, setPage] = useState<ApiFullPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"cleaned" | "raw">("cleaned");

  useEffect(() => {
    if (totalPages === 0) {
      setPage(null);
      return;
    }
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

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "cleaned" | "raw")}
          className="ml-auto shrink-0"
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

      <div className="flex-1 min-h-0 overflow-auto p-4">
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
            {tab === "cleaned"
              ? page.cleaned_text || (
                  <span className="italic text-muted-foreground">
                    (cleaned text empty — toggle to Raw to see what was
                    extracted)
                  </span>
                )
              : page.raw_text || (
                  <span className="italic text-muted-foreground">
                    (raw text empty)
                  </span>
                )}
          </pre>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right rail — chunks for active page + test-search
// ---------------------------------------------------------------------------

function RightRail({
  documentId,
  activePageNumber,
}: {
  documentId: string;
  activePageNumber: number;
}) {
  const [tab, setTab] = useState<"chunks" | "search">("chunks");
  return (
    <div className="flex flex-col min-h-0">
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "chunks" | "search")}
        className="flex-1 flex flex-col min-h-0"
      >
        <div className="border-b px-3 py-2">
          <TabsList className="h-7">
            <TabsTrigger value="chunks" className="h-6 text-xs">
              {RAG_VOCAB.segmentsShort} (this page)
            </TabsTrigger>
            <TabsTrigger value="search" className="h-6 text-xs">
              <SearchIcon className="h-3 w-3 mr-1" />
              Test search
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="chunks" className="flex-1 min-h-0 m-0">
          <ChunksOnPage documentId={documentId} pageNumber={activePageNumber} />
        </TabsContent>
        <TabsContent value="search" className="flex-1 min-h-0 m-0">
          <TestSearchPanel documentId={documentId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ChunksOnPage({
  documentId,
  pageNumber,
}: {
  documentId: string;
  pageNumber: number;
}) {
  const [chunks, setChunks] = useState<ApiChunkRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("limit", "50");
    params.set("page_number", String(pageNumber));
    getJson<ApiChunksResponse>(
      `/rag/library/${documentId}/chunks?${params.toString()}`,
    )
      .then(({ data }) => {
        if (cancelled || !data) return;
        setChunks(Array.isArray(data.chunks) ? data.chunks : []);
        setTotal(typeof data.total === "number" ? data.total : 0);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err?.message ??
              `Failed to load ${RAG_VOCAB.segmentsShort.toLowerCase()}`,
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, pageNumber]);

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-2">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading {RAG_VOCAB.segmentsShort.toLowerCase()}…
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!loading && !error && chunks.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            No {RAG_VOCAB.segmentsShort.toLowerCase()} for page {pageNumber}.
          </p>
        )}
        {chunks.map((c) => (
          <ChunkCard key={c.id} chunk={c} />
        ))}
        {total > chunks.length && (
          <p className="text-xs text-muted-foreground italic">
            Showing first {chunks.length} of {total}.
          </p>
        )}
      </div>
    </ScrollArea>
  );
}

function ChunkCard({ chunk }: { chunk: ApiChunkRow }) {
  return (
    <div className="border rounded-md p-2 space-y-1 bg-card">
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
      <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed font-sans overflow-x-auto">
        {chunk.content_text}
      </pre>
    </div>
  );
}

function TestSearchPanel({ documentId }: { documentId: string }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ApiTestSearchHit[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setHits(null);
    try {
      const { data } = await postJson<
        ApiTestSearchResponse,
        { query: string; limit: number }
      >(`/rag/library/${documentId}/test-search`, {
        query: query.trim(),
        limit: 10,
      });
      setHits(Array.isArray(data?.hits) ? data.hits : []);
      setTotal(
        typeof data?.total_chunks_in_doc === "number"
          ? data.total_chunks_in_doc
          : 0,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b p-3 space-y-2">
        <p className="text-xs text-muted-foreground">
          Lexical search over this document's {total || "—"}{" "}
          {RAG_VOCAB.segmentsShort.toLowerCase()}. This is what an agent scoped
          to this doc would retrieve.
        </p>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. 'opioid management'"
            className="h-8"
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
          />
          <Button size="sm" onClick={run} disabled={!query.trim() || loading}>
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <SearchIcon className="h-3 w-3" />
            )}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {error && (
            <p className="text-sm text-destructive">
              <strong>Error:</strong> {error}
            </p>
          )}
          {!error && hits && hits.length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              No matches. Try a different query, or simpler keywords.
            </p>
          )}
          {hits?.map((h, i) => (
            <div
              key={h.chunk_id}
              className="border rounded-md p-2 space-y-1 bg-card"
            >
              <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
                <Badge variant="outline" className="text-[10px] px-1 py-0">
                  #{i + 1}
                </Badge>
                <Badge variant="outline" className="text-[10px] px-1 py-0">
                  score {h.score.toFixed(3)}
                </Badge>
                {h.page_numbers && h.page_numbers.length > 0 && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                    p.{h.page_numbers[0]}
                    {h.page_numbers.length > 1
                      ? `–${h.page_numbers[h.page_numbers.length - 1]}`
                      : ""}
                  </Badge>
                )}
                {h.section_kind && (
                  <Badge variant="info" className="text-[10px] px-1 py-0">
                    {h.section_kind}
                  </Badge>
                )}
              </div>
              <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed font-sans overflow-x-auto">
                {h.content_text}
              </pre>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
