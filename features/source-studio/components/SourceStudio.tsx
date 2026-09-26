"use client";

/**
 * features/source-studio — THE Source screen, `/knowledge/sources/[id]`
 * (SOURCE-CONVERGENCE §8.2). Every kind of Source — a PDF, a web page, a
 * transcript, pasted text — opens here, and every old viewer route redirects
 * here with its params.
 *
 * Bar: Readwise Reader (one reader for every kind, the original beside the
 * clean text) and NotebookLM's source pane (a citation lands on its passage;
 * the source's guide — entities, where it is filed — sits beside it). Otter
 * for time: a segment or chunk click plays the recording from that moment.
 *
 *   ┌───────────┬──────────────────────────────┬───────────────┐
 *   │ Parts     │ Original │ Clean │ Raw        │ Chunks+search │
 *   │ (locator) │ (toggleable panes, one row)  │ Entities      │
 *   │           │                              │ Attached to   │
 *   └───────────┴──────────────────────────────┴───────────────┘
 *
 * Built from what exists: the PDF studio's PDF viewer and pane header, the
 * file previewers' players (now seekable), the library's chunk card and
 * in-document search, `RichContent` at level `full`, the Save panel, the
 * association grid, the door's edit route, and the server's current-version
 * fact (`source_list_facts.head_document_id`).
 */

import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import {
  Bookmark,
  Boxes,
  ListTree,
  Download,
  FileText,
  Library,
  Loader2,
  MousePointerClick,
  Pencil,
  Play,
  RefreshCw,
  Scissors,
  Wand2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RichContent } from "@/components/rich-content/RichContent";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useMediaQuery } from "@/hooks/use-media-query";
import { EntityModeHeader } from "@/features/shell/components/header/templates/EntityModeHeader";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { buildRagViewerContextData } from "@/features/rag/agent-context/buildRagViewerContextData";
import { useLibraryDoc } from "@/features/rag/hooks/useLibrary";
import { useDocumentSearch } from "@/features/rag/hooks/useDocumentSearch";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { KnowledgeAssetPanel } from "@/features/rag/components/library/KnowledgeAssetPanel";
import { PaneHeader } from "@/features/pdf-extractor/studio/PdfStudioReader";
import { useCurrentVersion } from "@/features/sources/hooks/useCurrentVersion";
import { viewedDocumentId } from "@/features/sources/currentVersion";
import {
  PORTION_KIND_WORD,
  formatMs,
  portionKindOf,
  portionLabel,
} from "@/features/sources/portionLocator";
import {
  SOURCE_STAGE_LABEL,
  isFileCanonicalExtract,
  sourceStage,
} from "@/features/sources/sourceRows";
import { SaveSourcePanel } from "@/features/sources/SaveSourcePanel";
import {
  editSource,
  keepSource,
  sourceRefusalSentence,
} from "@/features/sources/api/sourcesApi";
import { processSourceNow } from "@/features/sources/api/processNow";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { isOrganizationSelectionCancelled } from "@/lib/organization/organization-gate";
import { useScraperApi } from "@/features/scraper/hooks/useScraperApi";
import { downloadFile, exportFilename } from "@/components/agent-copy/export";
import {
  useSourceChunks,
  useSourceDoc,
  useSourceEntities,
  useExtractionCoverage,
  useSourceMedia,
  useSourcePortions,
  type SourceChunk,
  type SourceEntity,
} from "@/features/source-studio/hooks/useSourceData";
import {
  buildEditPortions,
  entitiesState,
  originalSeeks,
  portionIndexForChunk,
  portionIndexForPage,
  portionStartMs,
  readableText,
  resolveOriginalView,
  seekForPortion,
  sourceAsMarkdown,
  sourceUrl,
  studioLayout,
  type SeekRequest,
  type StudioPaneKey,
  type SourceDeepLink,
  type StudioPortion,
} from "@/features/source-studio/sourceStudioModel";
import { OriginalPane } from "./OriginalPane";
import { SourceSidePanes, type SideTab } from "./SourceSidePanes";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

/** The surface the standalone reader has always emitted — agents keep their context. */
const SOURCE_SURFACE = "matrx-user/knowledge-viewer";

type TextPaneKey = StudioPaneKey;
const PANE_LABEL: Record<TextPaneKey, string> = {
  original: "Original",
  clean: "Clean",
  raw: "Raw",
};

export interface SourceStudioProps {
  documentId: string;
  deepLink: SourceDeepLink;
}

export function SourceStudio({ documentId, deepLink }: SourceStudioProps) {
  const router = useRouter();

  // ── Which version (server rule: source_list_facts) ─────────────────────
  const version = useCurrentVersion(documentId);
  const [showOriginal, setShowOriginal] = useState(false);
  const viewedId = version.versions
    ? viewedDocumentId(version.versions, showOriginal)
    : null;
  const viewingCurrent =
    !!version.versions && viewedId === version.versions.currentId;

  // ── Reads ──────────────────────────────────────────────────────────────
  const source = useSourceDoc(viewedId);
  const doc = source.doc;
  const docLoading = version.loading || source.loading;
  const portionsRead = useSourcePortions(viewedId);
  const portions = portionsRead.portions;
  const media = useSourceMedia(doc);
  const chunksRead = useSourceChunks(viewedId);
  const entitiesRead = useSourceEntities(
    chunksRead.loading || chunksRead.error ? null : chunksRead.chunks.map((c) => c.id),
    chunksRead.total,
  );
  const libraryDoc = useLibraryDoc(viewedId);
  const coverage = useExtractionCoverage(viewedId);
  const search = useDocumentSearch(viewedId ?? documentId);
  const view = doc ? resolveOriginalView(doc, media.media) : null;

  // ── Active portion, opened on the deep link's portion ───────────────────
  const [activeIndex, setActiveIndex] = useState(0);
  const [deepResolved, setDeepResolved] = useState<string | null>(null);
  const deepKey = `${viewedId}|${deepLink.page}|${deepLink.chunkId}`;
  if (
    viewedId &&
    deepResolved !== deepKey &&
    !portionsRead.loading &&
    (!deepLink.chunkId || !chunksRead.loading)
  ) {
    setDeepResolved(deepKey);
    const rows = portions.map((p) => ({
      page_index: p.pageIndex,
      page_number: p.pageNumber,
    }));
    const chunk = deepLink.chunkId
      ? chunksRead.chunks.find((c) => c.id === deepLink.chunkId)
      : undefined;
    const fromChunk = chunk ? portionIndexForChunk(chunk, rows) : null;
    const target =
      fromChunk ??
      (deepLink.page ? portionIndexForPage(deepLink.page, rows) : null);
    if (target != null) setActiveIndex(target);
  }
  const active =
    portions.find((p) => p.pageIndex === activeIndex) ?? portions[0] ?? null;

  // ── Seek ───────────────────────────────────────────────────────────────
  const [seek, setSeek] = useState<SeekRequest | null>(null);
  const seekNonce = useRef(0);
  const canSeek = !!view && originalSeeks(view);
  const goToPortion = (pageIndex: number) => {
    setActiveIndex(pageIndex);
    setPartsSheetOpen(false);
    setSideSheetOpen(false);
    const p = portions.find((x) => x.pageIndex === pageIndex);
    const next = seekForPortion(p?.locator, canSeek, seekNonce.current + 1);
    if (next) {
      seekNonce.current = next.nonce;
      setSeek(next);
    }
  };
  const rows = portions.map((p) => ({
    page_index: p.pageIndex,
    page_number: p.pageNumber,
  }));
  const goToPage = (pageNumber: number) =>
    goToPortion(portionIndexForPage(pageNumber, rows));
  const goToChunk = (chunk: { page_numbers: number[] | null }) => {
    const idx = portionIndexForChunk(chunk, rows);
    if (idx != null) goToPortion(idx);
  };
  const chunkGoLabel = (chunk: SourceChunk): string | null => {
    const idx = portionIndexForChunk(chunk, rows);
    if (idx == null) return null;
    const p = portions.find((x) => x.pageIndex === idx);
    const ms = portionStartMs(p?.locator);
    if (canSeek && ms != null) return `Play from ${formatMs(ms)}`;
    return p ? `Go to ${nameOf(p)}` : null;
  };
  const goToEntity = (entity: SourceEntity) => {
    const chunk = chunksRead.chunks.find((c) => entity.chunkIds.includes(c.id));
    if (chunk) goToChunk(chunk);
    else toast.info(`${entity.name} is mentioned in a piece not listed here.`);
  };

  // ── Panes ──────────────────────────────────────────────────────────────
  const [panes, setPanes] = useState<Set<TextPaneKey>>(
    () => new Set<TextPaneKey>(["original", "clean"]),
  );
  const togglePane = (p: TextPaneKey) => {
    if (!tablet) {
      setPhonePane(p);
      return;
    }
    setPanesToggled(p);
  };
  const setPanesToggled = (p: TextPaneKey) =>
    setPanes((cur) => {
      const next = new Set(cur);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  const [sideTab, setSideTab] = useState<SideTab>("chunks");
  // Nothing vanishes at a narrower width (studioLayout): the right column and,
  // on a phone, the Parts list move behind header sheets.
  const wide = useMediaQuery("(min-width: 1280px)");
  const tablet = useMediaQuery("(min-width: 768px)");
  const [phonePane, setPhonePane] = useState<StudioPaneKey>("clean");
  const layout = studioLayout(wide ? 1280 : tablet ? 768 : 375, panes, phonePane);
  const [sideSheetOpen, setSideSheetOpen] = useState(false);
  const [partsSheetOpen, setPartsSheetOpen] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(deepLink.assets);

  // ── Actions ────────────────────────────────────────────────────────────
  const [saveOpen, setSaveOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [recapturing, setRecapturing] = useState(false);
  const [editing, setEditing] = useState<{ pageIndex: number; text: string } | null>(
    null,
  );
  const [savingEdit, setSavingEdit] = useState(false);
  const { scrapeUrl } = useScraperApi();

  const facts = version.facts;
  const stage = facts ? sourceStage(facts) : null;
  const currentId = version.versions?.currentId ?? documentId;
  const headId = version.versions?.originalId ?? documentId;
  const url = doc ? sourceUrl(doc) : null;

  const refreshAll = () => {
    source.reload();
    portionsRead.reload();
    chunksRead.reload();
    libraryDoc.reload();
  };

  const processNow = async () => {
    if (!doc || processing) return;
    setProcessing(true);
    try {
      const organizationId = await ensureOrgId(doc.organization_id);
      const landed = await keepSource(headId, { organizationId });
      if (landed.intelligence === "queued") {
        toast.success("Processing has started. Searchable pieces appear here when it finishes.");
      } else {
        const result = await processSourceNow(currentId, {
          isFileExtract: currentId === headId && isFileCanonicalExtract(doc),
        });
        if (!result.ok) throw new Error(result.message);
        toast.success(result.message);
      }
      refreshAll();
    } catch (err) {
      if (!isOrganizationSelectionCancelled(err))
        toast.error(sourceRefusalSentence(err));
    } finally {
      setProcessing(false);
    }
  };

  const recapture = async () => {
    if (!doc || !url || recapturing) return;
    setRecapturing(true);
    try {
      await ensureOrgId(doc.organization_id);
      const result = await scrapeUrl(url, { use_cache: false });
      if (!result) {
        toast.error("The page could not be read again. Try again in a moment.");
        return;
      }
      const note = result.sourceNotices[0]?.message;
      toast.success(note ?? "Captured again. If the page changed, this is now the newest version.");
      if (result.processedDocumentId && result.processedDocumentId !== documentId) {
        router.push(`/knowledge/sources/${result.processedDocumentId}`);
      } else {
        refreshAll();
      }
    } catch (err) {
      if (!isOrganizationSelectionCancelled(err))
        toast.error(sourceRefusalSentence(err));
    } finally {
      setRecapturing(false);
    }
  };

  const saveEdit = async () => {
    if (!doc || !editing || savingEdit) return;
    setSavingEdit(true);
    try {
      const organizationId = await ensureOrgId(doc.organization_id);
      const body = buildEditPortions(portions, editing.pageIndex, editing.text);
      const landed = await editSource(currentId, body, { organizationId });
      setEditing(null);
      toast.success(
        landed.notices?.[0]?.message ??
          "Saved as the edited version. The original capture is one click away.",
      );
      // The new version is now current; re-open on the same Source.
      router.replace(`/knowledge/sources/${landed.processed_document_id}`);
    } catch (err) {
      if (!isOrganizationSelectionCancelled(err))
        toast.error(sourceRefusalSentence(err));
    } finally {
      setSavingEdit(false);
    }
  };

  const exportMarkdown = () => {
    if (!doc) return;
    downloadFile(
      exportFilename(doc.name, "md"),
      sourceAsMarkdown(doc.name, portions, nameOf),
      "text/markdown",
    );
  };

  const isWeb = doc?.source_kind === "scrape_parsed_page";
  const isPdf = view?.kind === "pdf";
  const kept = !!doc?.kept_at;

  const actions = doc
    ? [
        kept
          ? {
              label: "Add to a Library or project",
              icon: Library,
              onPress: () => setSaveOpen(true),
            }
          : {
              label: "Save",
              icon: Bookmark,
              primary: true,
              onPress: () => setSaveOpen(true),
            },
        ...(viewingCurrent && portions.length > 0
          ? [
              {
                label: "Edit",
                icon: Pencil,
                onPress: () => {
                  if (!active) return;
                  setPanes((cur) => new Set(cur).add("clean"));
                  setPhonePane("clean");
                  setEditing({
                    pageIndex: active.pageIndex,
                    text: readableText(active),
                  });
                },
              },
            ]
          : []),
        {
          label: processing ? "Processing…" : "Process now",
          icon: processing ? Loader2 : Play,
          onPress: () => void processNow(),
          disabled: processing,
        },
        ...(isWeb && url
          ? [
              {
                label: recapturing ? "Capturing…" : "Capture again",
                icon: recapturing ? Loader2 : RefreshCw,
                onPress: () => void recapture(),
                disabled: recapturing,
              },
            ]
          : []),
        ...(portions.length > 0
          ? [{ label: "Export", icon: Download, onPress: exportMarkdown }]
          : []),
        { label: "Knowledge Assets", icon: Wand2, onPress: () => setAssetsOpen(true) },
        ...(isPdf
          ? [
              {
                label: "PDF tools",
                icon: Scissors,
                href: `/tools/pdf-extractor?doc=${encodeURIComponent(currentId)}`,
              },
            ]
          : []),
      ]
    : [];

  // ── Agent context (the reader's long-standing surface) ──────────────────
  const getScope = () =>
    buildRagViewerContextData({
      documentId: viewedId ?? documentId,
      doc: libraryDoc.doc,
      docLoading,
      docError: libraryDoc.error,
      activePageNumber: active?.pageNumber ?? 1,
      activePage: active
        ? {
            page: {
              page_index: active.pageIndex,
              page_number: active.pageNumber,
              raw_text: active.rawText,
              raw_char_count: active.rawText.length,
              cleaned_text: active.cleanedText,
              cleaned_char_count: active.cleanedText.length,
              extraction_method: null,
              used_ocr: false,
              section_kind: active.locator?.portion_kind ?? null,
              section_title: active.locator ? portionLabel(active.locator) : null,
              is_continuation: false,
              has_image: false,
            },
            view: "cleaned",
          }
        : null,
      searchQuery: search.activeQuery,
      searchHits: search.hits,
      searchSummary: search.summary,
      selectionText:
        typeof window !== "undefined"
          ? (window.getSelection()?.toString() ?? "")
          : "",
    });

  const sidePanes = (
    <SourceSidePanes
                tab={sideTab}
                onTabChange={setSideTab}
                chunks={chunksRead.chunks}
                chunkTotal={chunksRead.total}
                chunksLoading={chunksRead.loading}
                chunksError={chunksRead.error}
                highlightChunkId={deepLink.chunkId}
                chunkGoLabel={chunkGoLabel}
                onChunkGo={goToChunk}
                search={search}
                onSearchSubmit={() =>
                  void search.run().then((pages) => {
                    if (pages.length > 0) goToPage(pages[0]);
                  })
                }
                onJumpToPage={goToPage}
                activePageNumber={active?.pageNumber ?? 0}
                indexing={!!facts?.indexing}
                processing={processing}
                onProcessNow={doc ? () => void processNow() : null}
                entities={entitiesRead.entities}
                entitiesLoading={entitiesRead.loading}
                entitiesError={entitiesRead.error}
                entitiesTruncated={entitiesRead.truncated}
                entitiesState={entitiesState(
                  viewingCurrent ? (facts?.entitiesState ?? null) : null,
                  coverage,
                )}
                onEntityGo={goToEntity}
                attachments={facts ? facts.attachments : version.loading ? [] : null}
                onAttach={doc ? () => setSaveOpen(true) : null}
                source={
                  doc
                    ? { id: headId, orgId: doc.organization_id, label: doc.name }
                    : null
                }
              />
  );
  const partsList = (
    <PortionsList
        portions={portions}
        loading={portionsRead.loading}
        error={portionsRead.error}
        activeIndex={active?.pageIndex ?? null}
        onSelect={goToPortion}
        canSeek={canSeek}
      />
  );
  const unavailable = !docLoading && !doc;

  return (
    <SurfaceRuntimeProvider
      surfaceName={SOURCE_SURFACE}
      getScope={getScope}
      isEditable={false}
    >
      <div className="relative flex h-full flex-col bg-background">
        <EntityModeHeader
          backHref="/knowledge/library"
          entityLabel={docLoading || !doc ? "Loading…" : doc.name}
          entityStatus={
            doc ? (
              <span className="flex items-center gap-1">
                <Badge variant={kept ? "secondary" : "outline"} className="px-1.5 py-0 text-[10px]">
                  {kept ? "Saved" : "Not saved"}
                </Badge>
                {stage && viewingCurrent && (
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                    {SOURCE_STAGE_LABEL[stage]}
                  </Badge>
                )}
              </span>
            ) : undefined
          }
          actions={actions}
        />
        <div className="flex min-h-0 flex-1 flex-col pt-[var(--shell-header-h)]">
          {version.versions?.edited && (
            <div
              className="flex min-w-0 shrink-0 items-center gap-2 border-b px-4 py-1 text-xs"
              data-testid="source-version-switch"
            >
              <span className="truncate text-muted-foreground">
                {showOriginal
                  ? "Showing the original capture — people and AI search read the edited version."
                  : "Showing edited version"}
              </span>
              <span className="text-muted-foreground">·</span>
              <button
                type="button"
                className="shrink-0 text-primary hover:underline"
                onClick={() => {
                  setEditing(null);
                  setShowOriginal((v) => !v);
                }}
              >
                {showOriginal ? "View edited version" : "View original"}
              </button>
            </div>
          )}
          {version.error && (
            <div className="shrink-0 border-b px-4 py-1 text-xs text-warning">
              {version.error}
              <ErrorAlchemyMenu error={version.error} />
            </div>
          )}
          {media.error && (
            <div className="shrink-0 border-b px-4 py-1 text-xs text-warning">
              {media.error}
              <ErrorAlchemyMenu error={media.error} />
            </div>
          )}

          {unavailable ? (
            <AccessGate
              token="processed_document"
              id={viewedId ?? documentId}
              error={source.error ?? undefined}
              onRetry={source.reload}
              fallbackHref="/knowledge/library"
              fallbackLabel="Your Sources"
            />
          ) : (
            <div
              className={cn(
                "grid min-h-0 flex-1 divide-x overflow-hidden",
                layout.sideInline
                  ? "grid-cols-[240px_minmax(0,1fr)_360px]"
                  : layout.partsInline
                    ? "grid-cols-[220px_minmax(0,1fr)]"
                    : "grid-cols-1",
              )}
            >
              {layout.partsInline && partsList}
              <div className="flex min-h-0 min-w-0 flex-col">
                <PaneStrip
                  panes={new Set(layout.visiblePanes)}
                  onToggle={togglePane}
                  tabs={layout.paneStripIsTabs}
                  onOpenParts={
                    layout.partsInline ? null : () => setPartsSheetOpen(true)
                  }
                  partsCount={portions.length}
                  onOpenSide={layout.sideInline ? null : () => setSideSheetOpen(true)}
                  chunkCount={chunksRead.loading ? null : chunksRead.total}
                />
                <div className="flex min-h-0 flex-1 divide-x">
                  {layout.visiblePanes.includes("original") && (
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                      <PaneHeader
                        title="Original"
                        subtitle={view ? originalSubtitle(view.kind) : ""}
                        icon={<FileText className="h-3 w-3 text-primary" />}
                        onTogglePane={() => togglePane("original")}
                      />
                      <div className="min-h-0 flex-1">
                        {view && doc ? (
                          <OriginalPane
                            view={view}
                            name={doc.name}
                            pageNumber={pdfPageOf(active)}
                            onPageChange={(n) => {
                              if (isPdf) setActiveIndex(portionIndexForPage(n, rows));
                            }}
                            seek={seek}
                            passage={active ? readableText(active) : null}
                            organizationId={doc.organization_id}
                          />
                        ) : (
                          <div className="m-3 h-40 animate-pulse rounded-md bg-muted/50" />
                        )}
                      </div>
                    </div>
                  )}
                  {(["clean", "raw"] as const).map((key) =>
                    layout.visiblePanes.includes(key) ? (
                      <PortionTextPane
                        key={key}
                        field={key}
                        portion={active}
                        loading={portionsRead.loading}
                        error={portionsRead.error}
                        onToggle={() => togglePane(key)}
                        editing={key === "clean" ? editing : null}
                        onEditChange={(text) =>
                          setEditing((cur) => (cur ? { ...cur, text } : cur))
                        }
                        onEditCancel={() => setEditing(null)}
                        onEditSave={() => void saveEdit()}
                        savingEdit={savingEdit}
                        imagePolicy={doc?.source_kind === "inline" ? "self" : "other"}
                      />
                    ) : null,
                  )}
                  {layout.visiblePanes.length === 0 && (
                    <p className="p-6 text-sm text-muted-foreground">
                      Every pane is hidden. Turn one back on above.
                    </p>
                  )}
                </div>
              </div>
              {layout.sideInline && (
                <div className="flex min-h-0 flex-col">{sidePanes}</div>
              )}
            </div>
          )}
        </div>

        {!layout.sideInline && (
          <Drawer
            open={sideSheetOpen}
            onOpenChange={setSideSheetOpen}
            direction={tablet ? "right" : "bottom"}
          >
            <DrawerContent className={tablet ? "w-[420px] max-w-[90vw]" : "h-[85dvh]"}>
              {/* One column child: a side drawer lays its children in a row. */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <DrawerHeader className="px-4">
                  <DrawerTitle>Chunks, entities and attachments</DrawerTitle>
                </DrawerHeader>
                <div className="flex min-h-0 flex-1 flex-col">{sidePanes}</div>
              </div>
            </DrawerContent>
          </Drawer>
        )}
        {!layout.partsInline && (
          <Drawer open={partsSheetOpen} onOpenChange={setPartsSheetOpen} direction="bottom">
            <DrawerContent className="h-[85dvh]">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <DrawerHeader className="px-4">
                  <DrawerTitle>Parts</DrawerTitle>
                </DrawerHeader>
                <div className="flex min-h-0 flex-1 flex-col">{partsList}</div>
              </div>
            </DrawerContent>
          </Drawer>
        )}

        <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {kept ? "File" : "Save"} {doc?.name ?? "this Source"}
              </DialogTitle>
            </DialogHeader>
            {saveOpen && doc ? (
              <SaveSourcePanel
                embedded
                sources={[{ processedDocumentId: headId, name: doc.name }]}
                onCancel={() => setSaveOpen(false)}
                onSettled={refreshAll}
                onSaved={() => setSaveOpen(false)}
              />
            ) : null}
          </DialogContent>
        </Dialog>

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
              doc={{ id: doc.id, name: doc.name, totalPages: doc.total_pages }}
            />
          </MatrxDynamicPanelHost>
        )}
      </div>
    </SurfaceRuntimeProvider>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function nameOf(p: StudioPortion): string {
  return p.locator ? portionLabel(p.locator) : `Page ${p.pageNumber}`;
}

function pdfPageOf(p: StudioPortion | null): number | null {
  if (!p) return null;
  const loc = p.locator?.locator as { page?: unknown } | null | undefined;
  return typeof loc?.page === "number" ? loc.page : p.pageNumber;
}

function originalSubtitle(kind: string): string {
  switch (kind) {
    case "pdf":
      return "PDF";
    case "video":
    case "youtube":
      return "video";
    case "audio":
      return "audio";
    case "web-snapshot":
      return "as captured";
    case "web-live":
      return "live page";
    case "transcript-no-media":
      return "no recording";
    default:
      return "";
  }
}

// ── Parts list ────────────────────────────────────────────────────────────

function PortionsList({
  portions,
  loading,
  error,
  activeIndex,
  onSelect,
  canSeek,
}: {
  portions: StudioPortion[];
  loading: boolean;
  error: string | null;
  activeIndex: number | null;
  onSelect: (pageIndex: number) => void;
  canSeek: boolean;
}) {
  const kinds = new Set(
    portions.map((p) => (p.locator ? portionKindOf(p.locator) : "page")),
  );
  const heading =
    kinds.size === 1
      ? `${PORTION_KIND_WORD[[...kinds][0]]}s`
      : kinds.size > 1
        ? "Parts"
        : "Pages";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center border-b px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {loading ? "Parts…" : `${heading} (${portions.length})`}
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
        {loading && (
          <div className="space-y-1 p-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-9 animate-pulse rounded bg-muted/50" />
            ))}
          </div>
        )}
        {error && <p className="p-3 text-sm text-destructive">{error} <ErrorAlchemyMenu error={error} /></p>}
        {!loading && !error && portions.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">
            This Source has no text yet. Use Process now to read it again.
          </p>
        )}
        <ul className="divide-y" data-testid="source-portions">
          {portions.map((p) => {
            const kind = p.locator ? portionKindOf(p.locator) : "page";
            const timed = canSeek && portionStartMs(p.locator) != null;
            return (
              <li key={p.pageIndex}>
                <button
                  type="button"
                  onClick={() => onSelect(p.pageIndex)}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50",
                    p.pageIndex === activeIndex && "bg-accent text-accent-foreground",
                  )}
                  title={timed ? "Play from here" : undefined}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="break-words font-medium tabular-nums">
                      {nameOf(p)}
                    </span>
                    {kind !== "page" && (
                      <Badge variant="outline" className="shrink-0 px-1 py-0 text-[10px]">
                        {timed ? <Play className="h-2.5 w-2.5" /> : `${PORTION_KIND_WORD[kind]} ${p.pageNumber}`}
                      </Badge>
                    )}
                  </span>
                  <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {readableText(p).slice(0, 140)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ── Pane visibility strip ─────────────────────────────────────────────────

function PaneStrip({
  panes,
  onToggle,
  tabs,
  onOpenParts,
  partsCount,
  onOpenSide,
  chunkCount,
}: {
  panes: Set<TextPaneKey>;
  onToggle: (p: TextPaneKey) => void;
  /** Phone: pick one pane (tabs); wider: toggle several side by side. */
  tabs: boolean;
  /** When the Parts list is not in the grid (phone): opens its sheet. */
  onOpenParts: (() => void) | null;
  partsCount: number;
  /** When the right column is not in the grid (under 1280px): opens its sheet. */
  onOpenSide: (() => void) | null;
  chunkCount: number | null;
}) {
  return (
    <div
      className="flex h-9 shrink-0 items-center gap-1 border-b px-2 text-xs"
      role={tabs ? "tablist" : undefined}
      aria-label="Panes"
    >
      {(Object.keys(PANE_LABEL) as TextPaneKey[]).map((p) => (
        <button
          key={p}
          type="button"
          role={tabs ? "tab" : undefined}
          aria-selected={tabs ? panes.has(p) : undefined}
          aria-pressed={tabs ? undefined : panes.has(p)}
          onClick={() => onToggle(p)}
          className={cn(
            "h-7 shrink-0 whitespace-nowrap rounded-md font-medium transition-colors",
            tabs ? "px-2" : "px-2.5",
            panes.has(p)
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {PANE_LABEL[p]}
        </button>
      ))}
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {onOpenParts && (
          <button
            type="button"
            onClick={onOpenParts}
            title={`All ${partsCount} parts`}
            className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md px-1.5 font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ListTree className="h-3.5 w-3.5" /> Parts
          </button>
        )}
        {onOpenSide && (
          <button
            type="button"
            onClick={onOpenSide}
            title={
              chunkCount != null
                ? `${chunkCount} searchable pieces, entities and attachments`
                : "Searchable pieces, entities and attachments"
            }
            className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md px-1.5 font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Boxes className="h-3.5 w-3.5" /> Chunks
          </button>
        )}
      </span>
    </div>
  );
}

// ── Raw / Clean ───────────────────────────────────────────────────────────

function PortionTextPane({
  field,
  portion,
  loading,
  error,
  onToggle,
  editing,
  onEditChange,
  onEditCancel,
  onEditSave,
  savingEdit,
  imagePolicy,
}: {
  field: "clean" | "raw";
  portion: StudioPortion | null;
  loading: boolean;
  error: string | null;
  onToggle: () => void;
  editing: { pageIndex: number; text: string } | null;
  onEditChange: (text: string) => void;
  onEditCancel: () => void;
  onEditSave: () => void;
  savingEdit: boolean;
  imagePolicy: "self" | "other";
}) {
  const cleanMissing = field === "clean" && !!portion && !portion.cleanedText.trim();
  const text = portion
    ? field === "clean"
      ? readableText(portion)
      : portion.rawText
    : "";
  const isEditing = !!editing && !!portion && editing.pageIndex === portion.pageIndex;
  let body: ReactNode;
  if (loading) {
    body = <div className="h-40 animate-pulse rounded-md bg-muted/50" />;
  } else if (error) {
    body = <p className="text-sm text-destructive">{error} <ErrorAlchemyMenu error={error} /></p>;
  } else if (!portion) {
    body = <p className="text-sm text-muted-foreground">Nothing to show yet.</p>;
  } else if (isEditing) {
    body = (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          Your edit is saved as a new version. The original capture stays one click away.
        </p>
        <Textarea
          value={editing.text}
          onChange={(e) => onEditChange(e.target.value)}
          className="min-h-[240px] flex-1 font-mono text-sm"
          style={{ fontSize: "16px" }}
          autoFocus
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={onEditSave} disabled={savingEdit}>
            {savingEdit && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save edit
          </Button>
          <Button size="sm" variant="outline" onClick={onEditCancel} disabled={savingEdit}>
            Cancel
          </Button>
        </div>
      </div>
    );
  } else if (!text.trim()) {
    body = (
      <p className="text-sm italic text-muted-foreground">
        {field === "raw" ? "No text was read from this part." : "This part has no text."}
      </p>
    );
  } else {
    body = (
      <RichContent source={text} level="full" imagePolicy={imagePolicy} headingAnchors={false} />
    );
  }
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PaneHeader
        title={field === "clean" ? "Clean" : "Raw"}
        subtitle={
          portion
            ? `${nameOf(portion)}${cleanMissing && !isEditing ? " · not cleaned yet, showing raw" : ""}`
            : ""
        }
        icon={
          field === "clean" ? (
            <MousePointerClick className="h-3 w-3 text-primary" />
          ) : (
            <FileText className="h-3 w-3 text-primary" />
          )
        }
        onTogglePane={onToggle}
        onCopyAll={portion ? () => text : undefined}
        copyAllLabel="Copy this part"
      />
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">{body}</div>
    </div>
  );
}
