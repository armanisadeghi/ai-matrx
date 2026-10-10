"use client";

/**
 * SourceInspectorPane — the body of the Source Inspector window.
 *
 * A retrieved citation is only trustworthy if the user can land on the EXACT
 * place it came from and see everything the platform extracted there. Given a
 * Knowledge hit (`source_kind` + `source_id` + `page_number(s)` + `chunk_id`), this
 * pane:
 *   - resolves the file ↔ processed-document identity (the PDF bridge),
 *   - renders the real PDF AT THE EXACT PAGE (controlled `pageNumber`), or —
 *     for a recording (a YouTube video, an uploaded talk) — the Source's own
 *     player (`OriginalPane`) playing from the cited moment,
 *   - and unifies, in synced tabs that follow the page, everything anchored to
 *     it: the matched chunk (highlighted among its page siblings), the page's
 *     RAW extraction text, the CLEAN text, and any page-level extractions/tables.
 *
 * Composes the canonical parts — `PdfPreview`, `usePdfSurfaceLinks`,
 * `usePageBundle`, `ChunksOnPage`, `ExtractionsPane` — never forks them.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  BookMarked,
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
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { useFileNode } from "@/features/files/hooks/useFileNode";
import { InlineMediaRef } from "@ai-matrx/media/react";
import { BasicMarkdownContent } from "@ai-matrx/rich-content/display/chat-markdown/BasicMarkdownContent";
import { usePdfSurfaceLinks } from "@/features/pdf/hooks/usePdfSurfaceLinks";
import { useFilesLibraryProvenance } from "@/features/rag/hooks/useLibraryProvenance";
import { ChunksOnPage } from "@/features/rag/components/library/ChunkList";
import { ExtractionsPane } from "@/features/page-extraction/components/ExtractionsPane";
import { usePageBundle } from "./usePageBundle";
import { useCitedChunk } from "./useCitedChunk";
import {
  citedPages,
  citedTargetPage,
  openedPlace,
} from "./citedAnchor";
import {
  useSourceDoc,
  useSourceMedia,
} from "@/features/source-studio/hooks/useSourceData";
import {
  originalSeeks,
  resolveOriginalView,
} from "@/features/source-studio/sourceStudioModel";
import { OriginalPane } from "@/features/source-studio/components/OriginalPane";
import { ConversationEmbed } from "@/features/knowledge/hub/embeds/ConversationEmbed";
import { messageRangeOfPart } from "@/features/education/trust/recordCitation";
import { useDocumentPassage } from "@/features/education/trust/useDocumentPassage";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
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
  /** A recording's cited moment (ms) — the player starts here. */
  seekMs?: number | null;
  /** The citation's own place label, so chip and viewer name the same moment. */
  placeLabel?: string | null;
}

type TabKey = "match" | "clean" | "raw" | "extractions";

/** A conversation citation: the chat's own read-only transcript, at the cited messages. */
function ConversationCitationBody(props: SourceInspectorPaneProps) {
  const range = messageRangeOfPart(props.chunkId ?? "");
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="source-inspector-conversation">
      {props.placeLabel ? (
        <div className="shrink-0 border-b border-border px-3 py-1.5 type-secondary font-medium">
          {props.placeLabel}
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <ConversationEmbed
          conversationId={props.sourceId}
          messageId={null}
          messageRange={range}
        />
      </div>
    </div>
  );
}

/** A document citation (markdown or cloud): its text, the cited passage marked and scrolled to. */
function DocumentCitationBody(props: SourceInspectorPaneProps) {
  const { loading, doc, passage } = useDocumentPassage(
    props.sourceId,
    props.snippet ?? null,
    props.sourceKind === "udt_document" ? "udt_document" : "document",
  );
  const markRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    markRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [passage, doc]);
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }
  if (!doc) {
    return (
      <div role="alert" className="p-3 type-body text-muted-foreground">
        This document could not be opened.
      <ErrorAlchemyMenu /></div>
    );
  }
  const lines = doc.body.split("\n");
  const before = passage ? lines.slice(0, passage.startLine).join("\n") : doc.body;
  const cited = passage ? lines.slice(passage.startLine, passage.endLine).join("\n") : "";
  const after = passage ? lines.slice(passage.endLine).join("\n") : "";
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="source-inspector-document">
      {props.placeLabel ? (
        <div className="shrink-0 border-b border-border px-3 py-1.5 type-secondary font-medium">
          {props.placeLabel}
        </div>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3">
          {before.trim() ? <BasicMarkdownContent imagePolicy="other" content={before} /> : null}
          {passage ? (
            <div
              ref={markRef}
              data-testid="cited-passage"
              className="my-2 rounded-md border border-primary/50 bg-primary/[0.06] p-2.5 ring-1 ring-primary/20"
            >
              <Badge className="mb-1.5 text-[10px]">Cited</Badge>
              <BasicMarkdownContent imagePolicy="other" content={cited} />
            </div>
          ) : null}
          {after.trim() ? <BasicMarkdownContent imagePolicy="other" content={after} /> : null}
        </div>
      </ScrollArea>
    </div>
  );
}

export function SourceInspectorPane(props: SourceInspectorPaneProps) {
  if (props.sourceKind === "conversation") return <ConversationCitationBody {...props} />;
  if (props.sourceKind === "document" || props.sourceKind === "udt_document") {
    return <DocumentCitationBody {...props} />;
  }
  return <PageSourceInspector {...props} />;
}

function PageSourceInspector({
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
  seekMs = null,
  placeLabel = null,
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

  // Shared-library grant provenance for the header ("Shared library · via …").
  const provenanceIds = useMemo(() => (fileId ? [fileId] : []), [fileId]);
  const { labelByFile: provenanceByFile } =
    useFilesLibraryProvenance(provenanceIds);
  const provenanceLabelText = fileId
    ? (provenanceByFile.get(fileId) ?? null)
    : null;

  // The cited chunk's own anchor — a citation often names its chunk but not
  // its page (web page, transcript, note), and page 1 is then the WRONG
  // passage (verify-4 #33/#34). Read only when the citation has no page.
  const citationHasPage =
    (pageNumbers?.length ?? 0) > 0 || pageNumber != null;
  const cited = useCitedChunk(chunkId, processedDocumentId ?? null);
  const waitingForAnchor = !citationHasPage && cited.loading;

  // The page(s) the citation anchors to (1-based, clamped).
  const matchPages = useMemo(
    () => citedPages(pageNumbers, pageNumber, cited.facts),
    [pageNumbers, pageNumber, cited.facts],
  );
  const targetPage = citedTargetPage(matchPages);

  // The person's own paging wins; until then the viewer sits on the match.
  const [pickedPage, setActivePage] = useState<number | null>(null);
  const activePage = pickedPage ?? targetPage;

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

  // Where the citation points, named by the ONE place function the citation
  // popup also uses — a web section by its heading, a recording by its time,
  // only a real page as "Page N" — so popup and viewer always agree.
  const place = openedPlace(matchPages, cited.facts, seekMs, placeLabel);
  const spanLabel = place.label;
  const onMatchPage = matchPages.includes(activePage) || matchPages.length === 0;

  // A recording plays in the Source's own player from the cited moment — the
  // same player the Source page uses, never a second one.
  const startMs = place.kind === "time" ? place.seekMs : null;
  const recordingDoc = useSourceDoc(startMs != null ? (processedDocumentId ?? null) : null);
  const recordingMedia = useSourceMedia(recordingDoc.doc);
  const recordingView =
    recordingDoc.doc && !recordingMedia.loading
      ? resolveOriginalView(recordingDoc.doc, recordingMedia.media)
      : null;
  const player =
    recordingDoc.doc && recordingView && originalSeeks(recordingView) && startMs != null ? (
      <OriginalPane
        view={recordingView}
        name={recordingDoc.doc.name}
        pageNumber={null}
        seek={{ seconds: startMs / 1000, nonce: 1 }}
        passage={snippet}
        organizationId={recordingDoc.doc.organization_id}
      />
    ) : null;

  // ── Visual pane (the real document) ──────────────────────────────────────
  const visual = player ?? (showViewer ? (
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
  ) : null);

  // ── Tabs (everything anchored to this page) ──────────────────────────────
  const tabs = (
    <div className="flex h-full min-h-0 flex-col">
      {/* tab bar — horizontally scrolls its own box on narrow viewports instead
          of wrapping labels to two lines (the page itself never scrolls). */}
      <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto scrollbar-hide border-b border-border bg-muted/30 px-1.5 py-1">
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
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-1.5 type-secondary">
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
              {waitingForAnchor ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" aria-label="Finding the passage" />
                </div>
              ) : cited.facts?.part ? (
                // A part of a document with no search index yet: the cited
                // passage, then the page it sits on — never page 1's chunks.
                <ScrollArea className="h-full">
                  <div className="space-y-3 p-3">
                    {snippet ? (
                      <div className="rounded-md border border-primary/50 bg-primary/[0.06] p-2.5 type-secondary leading-relaxed text-foreground ring-1 ring-primary/20">
                        <Badge className="mb-1.5 text-[10px]">{query ? "Matched" : "Cited"}</Badge>
                        <p className="whitespace-pre-wrap break-words">{snippet}</p>
                      </div>
                    ) : null}
                    {matchPages.length > 0 && (page?.cleanedText || page?.rawText) ? (
                      <BasicMarkdownContent imagePolicy="other" content={page.cleanedText || page.rawText} />
                    ) : null}
                  </div>
                </ScrollArea>
              ) : hasDoc && processedDocumentId ? (
                <div className="flex h-full min-h-0 flex-col">
                  {cited.error && !citationHasPage ? (
                    <p role="alert" className="shrink-0 border-b border-border px-3 py-1.5 type-secondary text-warning">
                      {cited.error}
                    <ErrorAlchemyMenu error={cited.error} /></p>
                  ) : null}
                  <div className="min-h-0 flex-1">
                    <ChunksOnPage
                      documentId={processedDocumentId}
                      pageNumber={activePage}
                      highlightChunkId={onMatchPage ? chunkId : null}
                      plain
                      highlightLabel={query ? "Matched" : "Cited"}
                      placeLabel={onMatchPage ? spanLabel : undefined}
                    />
                  </div>
                </div>
              ) : (
                <ScrollArea className="h-full">
                  <div className="p-3">
                    {snippet ? (
                      <div className="rounded-md border border-primary/50 bg-primary/[0.06] p-2.5 type-secondary leading-relaxed text-foreground ring-1 ring-primary/20">
                        <Badge className="mb-1.5 text-[10px]">Matched</Badge>
                        <p className="whitespace-pre-wrap break-words">
                          {snippet}
                        </p>
                      </div>
                    ) : (
                      <p className="type-body text-muted-foreground">
                        No preview available for this source.
                      </p>
                    )}
                    <p className="mt-2 type-meta text-muted-foreground">
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
                <BasicMarkdownContent imagePolicy="other" content={page?.cleanedText ?? ""} />
              </PageTextState>
            </div>
          </ScrollArea>
        ) : null}

        {tab === "raw" ? (
          <ScrollArea className="h-full">
            <div className="p-3">
              <PageTextState loading={pageLoading} empty={!page?.rawText}>
                <pre className="whitespace-pre-wrap break-words font-mono type-secondary leading-relaxed text-foreground">
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
      <span className="truncate type-title text-foreground">
        {fileName ?? "Source"}
      </span>
      {provenanceLabelText ? (
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 type-meta font-medium text-primary-ink"
          title="You can read this source through a shared-knowledge grant"
        >
          <BookMarked className="h-3 w-3" />
          {provenanceLabelText}
        </span>
      ) : null}
      {spanLabel ? (
        <span
          className={cn(
            "shrink-0 rounded-md px-1.5 py-0.5 type-meta font-medium tabular-nums",
            onMatchPage
              ? "bg-primary/10 text-primary-ink"
              : "bg-muted text-muted-foreground",
          )}
        >
          {onMatchPage ? spanLabel : place.kind === "page" ? `Page ${activePage}` : spanLabel}
        </span>
      ) : null}
      {!onMatchPage ? (
        <button
          type="button"
          onClick={() => setActivePage(targetPage)}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-primary-ink transition-colors hover:bg-primary/10"
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
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 type-meta font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
            <div className="h-[42dvh] shrink-0 border-b border-border">
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
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
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
      <div className="flex items-center gap-2 py-6 type-body text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading page…
      </div>
    );
  }
  if (empty) {
    return (
      <div className="flex items-center gap-2 py-6 type-body text-muted-foreground">
        <FileText className="h-4 w-4" />
        Nothing extracted for this page.
      </div>
    );
  }
  return <>{children}</>;
}
