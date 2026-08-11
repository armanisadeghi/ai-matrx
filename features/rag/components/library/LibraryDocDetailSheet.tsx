"use client";

/**
 * Detail drilldown for one processed document.
 *
 * Three tabs:
 *   - Overview  — counts, lineage, data-store bindings, copy-id buttons
 *   - Pages     — first ~25 pages with cleaned + raw text side-by-side
 *   - Chunks    — sample chunks with embedding presence + full chunk text
 *
 * Goals:
 *   - Make it impossible to "lose" a document — everything we have on
 *     it is visible from this sheet.
 *   - Summary payload may include short previews; this sheet loads full
 *     page/chunk bodies from `/rag/library/.../page|chunks` endpoints.
 */

import { useEffect, useRef, useState } from "react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { EntityDoorControls } from "@/components/official/entity-ref/EntityDoorControls";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ExternalLink,
  Database,
  FileText,
  Layers,
  Trash2,
  Pencil,
  RefreshCw,
  Sparkles,
  Wand2,
  Binary,
  GitCompareArrows,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { MatrxUuidCell } from "@/components/official/matrx-data-table/MatrxUuidCell";
import { FileRightClickMenu } from "@/features/files/components/core/FileContextMenu/FileRightClickMenu";
import { useOpenDiffViewerWindow } from "@/features/overlays/openers/diffViewerWindow";
import { useOpenFilePreviewWindow } from "@/features/overlays/openers/filePreviewWindow";
import {
  citationOpensInWindow,
  useOpenCitation,
} from "@/features/rag/components/source-inspector/useOpenCitation";
import { createClient } from "@/utils/supabase/client";
import { ragDb } from "@/utils/supabase/ragDb";
import type { components } from "@/types/python-generated/api-types";
import { StatusBadge } from "./StatusBadge";
import { StageStatusPills } from "./StageStatusPills";
import { useLibraryDoc } from "@/features/rag/hooks/useLibrary";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import type { LibraryChunkPreview } from "@/features/rag/types/library";
import type { StageName } from "@/features/rag/api/stages";
import type { ProcessingJob } from "@/features/rag/hooks/useProcessingRunner";
import { ProcessingJobView } from "./ProcessingJobView";
import { KnowledgeAssetPanel } from "./KnowledgeAssetPanel";
import { AccessGate } from "@/features/access-gate/components/AccessGate";

function sourceHref(sourceKind: string, sourceId: string): string {
  const id = encodeURIComponent(sourceId);
  switch (sourceKind) {
    case "cld_file":
      return `/files/f/${id}`;
    case "note":
      return `/notes/${id}`;
    case "code_file":
      return `/code/${id}`;
    case "library_doc":
      return `/rag/viewer/${id}`;
    case "transcript":
      return `/transcription/studio?session=${id}`;
    case "scraped":
      return `/scraper?url=${id}`;
    default:
      return `/rag/viewer/${id}`;
  }
}

function documentHumanSummary(
  doc: NonNullable<ReturnType<typeof useLibraryDoc>["doc"]>,
): string {
  return [
    doc.name,
    `Document ID: ${doc.id}`,
    `Source: ${doc.sourceKind} ${doc.sourceId}`,
    `Status: ${doc.status}`,
    `Pages: ${doc.pagesPersisted}${doc.totalPages ? ` / ${doc.totalPages}` : ""}`,
    `${RAG_VOCAB.segmentsShort}: ${doc.chunks}`,
    `Embeddings: ${doc.embeddingsOai} OpenAI, ${doc.embeddingsVoyage} Voyage`,
    `Data stores: ${doc.dataStores.map((store) => store.name).join(", ") || "none"}`,
  ].join("\n");
}

export interface LibraryDocDetailSheetProps {
  processedDocumentId: string | null;
  /** Parent bumps this to refetch when the user re-clicks the same table row. */
  reloadKey?: number;
  onClose: () => void;
  /** Called after the user mutates the doc (delete / rename) so the
   *  parent table can refetch. Optional — sheet still works without it. */
  onMutated?: () => void;
  /** Optional — when provided, clicking a stage pill opens this
   *  page-level full-screen dialog instead of the inline popover. */
  onRequestStageRun?: (
    stage: StageName,
    processedDocumentId: string,
    documentName: string,
  ) => void;
  /** Live processing jobs for THIS doc — when present, the Stages tab
   *  renders the rich live job view inline (in-place inside this sheet)
   *  instead of relying on the standalone ProcessingProgressSheet. The
   *  caller filters runner.jobs down to only this doc's jobs. */
  activeJobs?: ProcessingJob[];
  /** Cancel handler for inline jobs (forwarded to ProcessingJobView). */
  onCancelJob?: (jobId: string) => void;
  /** Dismiss handler for inline jobs (forwarded to ProcessingJobView). */
  onDismissJob?: (jobId: string) => void;
}

export function LibraryDocDetailSheet({
  processedDocumentId,
  reloadKey: externalReloadKey = 0,
  onClose,
  onMutated,
  onRequestStageRun,
  activeJobs,
  onCancelJob,
  onDismissJob,
}: LibraryDocDetailSheetProps) {
  const { doc, loading, error, readError, reload } =
    useLibraryDoc(processedDocumentId);
  const openFilePreview = useOpenFilePreviewWindow();
  const openCitation = useOpenCitation();
  const lastExternalReloadKeyRef = useRef(externalReloadKey);

  useEffect(() => {
    if (externalReloadKey === lastExternalReloadKeyRef.current) return;
    lastExternalReloadKeyRef.current = externalReloadKey;
    if (processedDocumentId) reload();
  }, [externalReloadKey, processedDocumentId, reload]);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmDeleteMode, setConfirmDeleteMode] = useState<
    "processing" | "file"
  >("processing");
  const [deleting, setDeleting] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);

  const handleRename = async () => {
    if (!doc || !renameValue.trim() || renameValue === doc.name) {
      setRenameOpen(false);
      return;
    }
    setRenaming(true);
    try {
      const supabase = createClient();
      // Curator-or-owner gated: docproc.processed_documents RLS
      // (processed_documents_owner_all + processed_documents_curator_update)
      // already matches LibraryPatchRequest's authorization exactly.
      const { error: updateError } = await supabase
        .schema("docproc")
        .from("processed_documents")
        .update({ name: renameValue.trim() })
        .eq("id", doc.id);
      if (updateError) {
        throw new Error(
          "We couldn't rename this document. Only its owner or a curator can change it.",
        );
      }
      toast.success("Document renamed");
      setRenameOpen(false);
      reload();
      onMutated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setRenaming(false);
    }
  };

  const handleDelete = async () => {
    if (!doc) return;
    setDeleting(true);
    try {
      const supabase = createClient();
      if (confirmDeleteMode === "file") {
        // Full delete — processing + source cld_files row.
        const { data, error: rpcError } = await ragDb(supabase).rpc(
          "fn_delete_library_document_and_source",
          { p_id: doc.id },
        );
        if (rpcError) {
          throw new Error(
            "We couldn't delete this file and its documents. You may not be allowed to delete them.",
          );
        }
        const result = data as unknown as {
          deleted_documents?: number;
          deleted_chunks?: number;
          deleted_cld_file?: boolean;
        } | null;
        toast.success(
          result?.deleted_cld_file
            ? `File and its ${result?.deleted_documents ?? 0} document${(result?.deleted_documents ?? 0) === 1 ? "" : "s"} moved to trash (${result?.deleted_chunks ?? 0} ${RAG_VOCAB.segmentsShort.toLowerCase()} hidden). Restorable from the trash.`
            : `Document family moved to trash (${result?.deleted_chunks ?? 0} ${RAG_VOCAB.segmentsShort.toLowerCase()} hidden).`,
        );
      } else {
        // Processing-only delete — keeps the source binary.
        const { data, error: rpcError } = await ragDb(supabase).rpc(
          "fn_delete_library_document",
          { p_id: doc.id },
        );
        if (rpcError) {
          throw new Error(
            "We couldn't delete this document. You may not be allowed to delete it.",
          );
        }
        const result = data as unknown as {
          deleted_chunks?: number;
        } | null;
        toast.success(
          `Document moved to trash (${result?.deleted_chunks ?? 0} ${RAG_VOCAB.segmentsShort.toLowerCase()} hidden). Source file intact.`,
        );
      }
      setConfirmDeleteOpen(false);
      onMutated?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Kick the FULL extract → clean → chunk → embed pipeline through the
   * shared useProcessingRunner so the inline ProcessingJobView in the
   * Stages tab streams every progress event, exactly like a manual
   * stage click. Caller (LibraryPage) wires this to runStage(docId,
   * "run_all", …); the inline view picks the new job up automatically
   * because LibraryPage filters runner.jobs by processedDocumentId.
   *
   * Replaces the legacy POST /rag/library/{id}/reprocess fire-and-forget,
   * which a) hit Next.js with no auth and b) showed zero progress.
   */
  const handleReprocess = () => {
    if (!doc || !onRequestStageRun) {
      toast.error(
        "Reprocess is unavailable in this view — no stage runner wired.",
      );
      return;
    }
    setReprocessing(true);
    try {
      onRequestStageRun("run_all", doc.id, doc.name);
      toast.success(
        "Re-processing started — watch the Stages tab below for live progress.",
      );
      onMutated?.();
    } finally {
      // The actual job runs asynchronously in the runner; the sheet
      // re-enables the button immediately so the user can stop or
      // re-trigger if they need to.
      setTimeout(() => setReprocessing(false), 800);
    }
  };

  // "Process Document" — same path as reprocess but labeled / iconed
  // differently when the doc has never finished a full pipeline yet, so
  // first-time users get a primary CTA instead of an ambiguous
  // "Re-process" button. The runner doesn't care which label triggered
  // it.
  const handleProcess = handleReprocess;
  const hasNeverBeenProcessed = !!doc && doc.chunks === 0;
  const isPartiallyProcessed =
    !!doc && doc.chunks > 0 && doc.embeddingsOai < doc.chunks;

  const open = Boolean(processedDocumentId);

  const panelTitle =
    loading && !doc
      ? "Loading document…"
      : error && !doc
        ? "Could not load document"
        : doc
          ? doc.name
          : "Document";

  const panelDescription =
    error && !doc ? (
      error
    ) : doc && !loading ? (
      <span className="inline-flex items-center gap-2">
        <StatusBadge status={doc.status} />
        <span>
          {doc.derivationKind} · created{" "}
          {new Date(doc.createdAt).toLocaleString()}
        </span>
      </span>
    ) : undefined;

  const panelHeaderActions =
    doc && !error ? (
      <div className="flex gap-2 shrink-0">
        <CopyButtons
          size="sm"
          label={doc.name}
          human={() => documentHumanSummary(doc)}
          agent={() => ({
            kind: "rag-library-document",
            location: "AI Matrx — RAG Document Library — Detail panel",
            description:
              "Complete detail payload for the processed document currently open in the library.",
            data: doc,
            summary: documentHumanSummary(doc),
            attributes: {
              id: doc.id,
              "source-kind": doc.sourceKind,
              "source-id": doc.sourceId,
              status: doc.status,
            },
            context: {
              "processed-document-id": doc.id,
              "source-id": doc.sourceId,
              "parent-processed-document-id": doc.parentProcessedId,
            },
          })}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            window.open(
              `/rag/library/${doc.id}/preview`,
              "_blank",
              "noopener,noreferrer",
            );
          }}
        >
          <ExternalLink className="h-3.5 w-3.5 mr-1" />
          Preview
        </Button>
      </div>
    ) : undefined;

  return (
    <>
      <MatrxDynamicPanelHost
        key={processedDocumentId ?? "closed"}
        open={open}
        onOpenChange={(o) => {
          if (!o) onClose();
        }}
        title={panelTitle}
        description={panelDescription}
        headerActions={panelHeaderActions}
        position="right"
        defaultSize={50}
        maxSize={92}
        contentClassName="flex min-h-0 flex-1 flex-col p-0"
      >
        {loading && !doc ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !doc ? (
          /* Nothing loaded. A zero-row read is denied / deleted / never
           * existed / signed out — the gate resolves which and offers the way
           * forward, instead of this panel asserting one. */
          <div className="min-h-0 flex-1 overflow-auto">
            <AccessGate
              token="processed_document"
              id={processedDocumentId ?? ""}
              error={readError}
              onRetry={reload}
              fallbackHref="/rag/library"
              fallbackLabel="Library"
            />
          </div>
        ) : (
          <>
            {error ? (
              <div className="mx-6 mt-3 flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <span className="min-w-0 text-left">{error}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0"
                  onClick={reload}
                >
                  Retry
                </Button>
              </div>
            ) : null}
            <div className="border-b px-6 pb-3 pt-1">
              {/* Action row */}
              <div className="flex flex-wrap gap-2">
                {/* Primary CTA: "Process Document" (never run) or
                    "Finish Processing" (chunks exist but embeddings
                    missing) or "Re-process" (everything is there but
                    the user wants to rebuild). Always routes through
                    the same run_all pipeline via the runner so the
                    inline ProcessingJobView shows live progress. */}
                {hasNeverBeenProcessed ? (
                  <Button
                    size="sm"
                    onClick={handleProcess}
                    disabled={reprocessing}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <Sparkles
                      className={
                        "h-3.5 w-3.5 mr-1 " +
                        (reprocessing ? "animate-spin" : "")
                      }
                    />
                    {reprocessing ? "Starting…" : "Process Document"}
                  </Button>
                ) : isPartiallyProcessed ? (
                  <Button
                    size="sm"
                    onClick={handleProcess}
                    disabled={reprocessing}
                    className="bg-amber-500 text-white hover:bg-amber-500/90"
                    title={`${doc.embeddingsOai} of ${doc.chunks} ${RAG_VOCAB.segmentsShort.toLowerCase()} have embeddings — run the pipeline to finish.`}
                  >
                    <Wand2
                      className={
                        "h-3.5 w-3.5 mr-1 " +
                        (reprocessing ? "animate-spin" : "")
                      }
                    />
                    {reprocessing
                      ? "Resuming…"
                      : `Finish Processing (${doc.chunks - doc.embeddingsOai} left)`}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleReprocess}
                    disabled={reprocessing}
                  >
                    <RefreshCw
                      className={
                        "h-3.5 w-3.5 mr-1 " +
                        (reprocessing ? "animate-spin" : "")
                      }
                    />
                    {reprocessing ? "Re-processing…" : "Re-process"}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRenameValue(doc.name);
                    setRenameOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Rename
                </Button>
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    title={`Remove processing artifacts (${RAG_VOCAB.segmentsShort.toLowerCase()}, embeddings) but keep the source file. Re-process to rebuild.`}
                    onClick={() => {
                      setConfirmDeleteMode("processing");
                      setConfirmDeleteOpen(true);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Delete processing
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    title="Delete this document AND remove the source file from cloud storage. Cannot be undone."
                    onClick={() => {
                      setConfirmDeleteMode("file");
                      setConfirmDeleteOpen(true);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Delete file
                  </Button>
                </div>
              </div>

              {/* Counts strip */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4 text-xs">
                <CountChip
                  icon={<FileText className="h-3 w-3" />}
                  label="Pages"
                  value={`${doc.pagesPersisted}${doc.totalPages ? ` / ${doc.totalPages}` : ""}`}
                />
                <CountChip
                  icon={<Layers className="h-3 w-3" />}
                  label={RAG_VOCAB.segmentsShort}
                  value={String(doc.chunks)}
                />
                <CountChip
                  icon={<Binary className="h-3 w-3" />}
                  label="OAI emb."
                  value={`${doc.embeddingsOai} / ${doc.chunks}`}
                  highlight={
                    doc.chunks > 0 && doc.embeddingsOai < doc.chunks
                      ? "warning"
                      : "ok"
                  }
                />
                <CountChip
                  icon={<Binary className="h-3 w-3" />}
                  label="Voyage emb."
                  value={String(doc.embeddingsVoyage)}
                />
                <CountChip
                  icon={<Database className="h-3 w-3" />}
                  label="Data stores"
                  value={String(doc.dataStores.length)}
                  highlight={doc.dataStores.length === 0 ? "warning" : "ok"}
                />
              </div>
            </div>

            <Tabs
              defaultValue="stages"
              className="flex-1 flex flex-col min-h-0"
            >
              <TabsList className="mx-6 mt-3 self-start">
                <TabsTrigger value="stages">Stages</TabsTrigger>
                <TabsTrigger value="assets">Knowledge Asset</TabsTrigger>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="pages">
                  Pages ({doc.pagesPersisted})
                </TabsTrigger>
                <TabsTrigger value="chunks">
                  {RAG_VOCAB.segmentsShort} ({doc.chunks})
                </TabsTrigger>
              </TabsList>

              <TabsContent
                value="stages"
                className="flex-1 min-h-0 mt-2 px-6 pb-6"
              >
                <ScrollArea className="h-full">
                  <div className="space-y-4 pr-3">
                    <div>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        Pipeline state
                      </h3>
                      <p className="text-xs text-muted-foreground mb-3">
                        Each pill is a stable stage. Click any pill to run (or
                        re-run) the action that produces it. Progress and
                        heartbeats stream live below.
                      </p>
                      <StageStatusPills
                        processedDocumentId={doc.id}
                        documentName={doc.name}
                        onRequestRun={
                          onRequestStageRun
                            ? (stage) =>
                                onRequestStageRun(stage, doc.id, doc.name)
                            : undefined
                        }
                        onMutated={() => {
                          reload();
                          onMutated?.();
                        }}
                      />
                    </div>

                    {/* Inline live job view — replaces the explanation card
                        while a job is in flight (or freshly finished). The
                        sheet stays the same width, so this just fills the
                        existing tab area with the rich animated visualization
                        instead of opening a second sheet. */}
                    {activeJobs && activeJobs.length > 0 ? (
                      <div className="space-y-6">
                        {activeJobs.map((job) => (
                          <ProcessingJobView
                            key={job.jobId}
                            job={job}
                            showActions
                            onCancel={
                              onCancelJob
                                ? () => onCancelJob(job.jobId)
                                : undefined
                            }
                            onDismiss={
                              onDismissJob
                                ? () => onDismissJob(job.jobId)
                                : undefined
                            }
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-md border bg-muted/20 p-3 text-xs space-y-2">
                        <div className="font-medium text-foreground">
                          How it flows
                        </div>
                        <ol className="ml-5 list-decimal space-y-1 text-muted-foreground">
                          <li>
                            <strong className="text-foreground">
                              Cloud File
                            </strong>{" "}
                            — your uploaded binary lives in S3 (
                            <code>cld_files</code>).
                          </li>
                          <li>
                            <strong className="text-foreground">
                              Raw Text
                            </strong>{" "}
                            — pages are extracted from the binary (
                            <em>Extract</em> action).
                          </li>
                          <li>
                            <strong className="text-foreground">
                              Clean Text
                            </strong>{" "}
                            — each page is LLM-cleaned + section-classified (
                            <em>Clean</em> action).
                          </li>
                          <li>
                            <strong className="text-foreground">
                              {RAG_VOCAB.segmentsShort}
                            </strong>{" "}
                            — pages are split into retrievable, page-aware
                            knowledge segments (
                            <em>{RAG_VOCAB.segmentShort}</em> action).
                          </li>
                          <li>
                            <strong className="text-foreground">Vectors</strong>{" "}
                            — each {RAG_VOCAB.segmentShort.toLowerCase()} gets
                            an embedding for similarity search (<em>Embed</em>{" "}
                            action).
                          </li>
                          <li>
                            <strong className="text-foreground">
                              In Stores
                            </strong>{" "}
                            — a data-store binding is what makes content
                            discoverable to an agent (manage from the Data
                            Stores page).
                          </li>
                        </ol>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent
                value="assets"
                className="flex-1 min-h-0 mt-2 px-2 pb-6"
              >
                <ScrollArea className="h-full">
                  <KnowledgeAssetPanel
                    doc={{
                      id: doc.id,
                      name: doc.name,
                      totalPages: doc.totalPages,
                    }}
                  />
                </ScrollArea>
              </TabsContent>

              <TabsContent
                value="overview"
                className="flex-1 min-h-0 mt-2 px-6 pb-6"
              >
                <ScrollArea className="h-full">
                  <div className="space-y-4 pr-3">
                    <Section title="Identity">
                      <KV
                        k="Document ID"
                        v={
                          <MatrxUuidCell
                            value={doc.id}
                            label="Document ID"
                            href={`/rag/viewer/${encodeURIComponent(doc.id)}`}
                            onOpen={(id) => {
                              openCitation({
                                sourceKind: "library_doc",
                                sourceId: id,
                                href: `/rag/viewer/${encodeURIComponent(id)}`,
                                fileName: doc.name,
                              });
                            }}
                          />
                        }
                      />
                      <KV
                        k="Source"
                        v={
                          doc.sourceKind === "cld_file" ? (
                            <FileRightClickMenu fileId={doc.sourceId}>
                              <span className="inline-flex items-center gap-1.5 rounded-sm">
                                <span className="text-xs text-muted-foreground">
                                  {doc.sourceKind}
                                </span>
                                <MatrxUuidCell
                                  value={doc.sourceId}
                                  label="Source file ID"
                                  href={sourceHref(
                                    doc.sourceKind,
                                    doc.sourceId,
                                  )}
                                  onOpen={(id) => {
                                    openFilePreview({ fileId: id });
                                  }}
                                />
                              </span>
                            </FileRightClickMenu>
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground">
                                {doc.sourceKind}
                              </span>
                              <MatrxUuidCell
                                value={doc.sourceId}
                                label="Source ID"
                                href={sourceHref(doc.sourceKind, doc.sourceId)}
                                onOpen={
                                  citationOpensInWindow(doc.sourceKind)
                                    ? (id) => {
                                        openCitation({
                                          sourceKind: doc.sourceKind,
                                          sourceId: id,
                                          href: sourceHref(doc.sourceKind, id),
                                          fileName: doc.name,
                                        });
                                      }
                                    : undefined
                                }
                              />
                            </span>
                          )
                        }
                      />
                      <KV k="MIME" v={doc.mimeType ?? "—"} />
                      <KV
                        k="Has structured JSON"
                        v={doc.hasStructuredJson ? "yes" : "no"}
                      />
                    </Section>

                    <Section title="Lineage">
                      <KV k="Derivation" v={doc.derivationKind} />
                      <KV
                        k="Parent"
                        v={
                          doc.parentProcessedId ? (
                            <MatrxUuidCell
                              value={doc.parentProcessedId}
                              label="Parent document ID"
                              href={`/rag/viewer/${encodeURIComponent(doc.parentProcessedId)}`}
                              onOpen={(id) => {
                                openCitation({
                                  sourceKind: "library_doc",
                                  sourceId: id,
                                  href: `/rag/viewer/${encodeURIComponent(id)}`,
                                });
                              }}
                            />
                          ) : (
                            "(none — initial extract)"
                          )
                        }
                      />
                    </Section>

                    <Section title="Data-store bindings">
                      {doc.dataStores.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Not bound to any data store. Bind it on the{" "}
                          <a
                            href="/rag/data-stores"
                            className="underline"
                            target="_blank"
                          >
                            Data Stores page
                          </a>{" "}
                          to make it searchable by an agent.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {doc.dataStores.map((s) => (
                            <div
                              key={s.dataStoreId}
                              className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground"
                            >
                              <Database className="h-3 w-3 mr-1" />
                              <a
                                href={`/rag/data-stores?store_id=${encodeURIComponent(s.dataStoreId)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline"
                              >
                                {s.name}
                                {s.shortCode ? ` · ${s.shortCode}` : ""}
                              </a>
                              <MatrxUuidCell
                                value={s.dataStoreId}
                                label={`${s.name} data store ID`}
                                href={`/rag/data-stores?store_id=${encodeURIComponent(s.dataStoreId)}`}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </Section>
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent
                value="pages"
                className="flex-1 min-h-0 mt-2 px-6 pb-6"
              >
                <ScrollArea className="h-full">
                  <div className="space-y-3 pr-3">
                    {doc.pages.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No pages persisted yet.
                      </p>
                    ) : (
                      doc.pages.map((p) => (
                        <div
                          key={p.pageIndex}
                          className="border rounded-md p-3 space-y-2 bg-card"
                        >
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline">Page {p.pageNumber}</Badge>
                            {p.extractionMethod && (
                              <Badge variant="outline">
                                {p.extractionMethod}
                              </Badge>
                            )}
                            {p.usedOcr && <Badge variant="warning">OCR</Badge>}
                            {p.sectionKind && (
                              <Badge variant="info">{p.sectionKind}</Badge>
                            )}
                            {p.isContinuation && (
                              <Badge variant="secondary">cont.</Badge>
                            )}
                            <span className="ml-auto">
                              raw {p.rawCharCount.toLocaleString()} ch · clean{" "}
                              {p.cleanedCharCount.toLocaleString()} ch
                            </span>
                          </div>
                          {p.sectionTitle && (
                            <p className="text-sm font-medium">
                              {p.sectionTitle}
                            </p>
                          )}
                          <SheetFullPagePreviews
                            documentId={doc.id}
                            pageIndex={p.pageIndex}
                            fallbackCleaned={p.cleanedPreview}
                            fallbackRaw={p.rawPreview}
                          />
                        </div>
                      ))
                    )}
                    {doc.pagesPersisted > doc.pages.length && (
                      <p className="text-xs text-muted-foreground italic">
                        Showing first {doc.pages.length} of {doc.pagesPersisted}{" "}
                        pages. Open the 4-pane viewer for the rest.
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent
                value="chunks"
                className="flex-1 min-h-0 mt-2 px-6 pb-6"
              >
                <ScrollArea className="h-full">
                  <div className="space-y-3 pr-3">
                    {doc.sampleChunks.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No segments yet — extraction completed but{" "}
                        {RAG_VOCAB.segmentation.toLowerCase()} has not run, or
                        it failed.
                      </p>
                    ) : (
                      <SheetChunksPanel
                        documentId={doc.id}
                        fallbackSamples={doc.sampleChunks}
                      />
                    )}
                    {doc.chunks > doc.sampleChunks.length && (
                      <p className="text-xs text-muted-foreground italic">
                        Showing first {doc.sampleChunks.length} of {doc.chunks}{" "}
                        {RAG_VOCAB.segmentsShort.toLowerCase()}.
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </>
        )}
      </MatrxDynamicPanelHost>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename document</DialogTitle>
            <DialogDescription>
              The name is the display label only —{" "}
              {RAG_VOCAB.segmentsShort.toLowerCase()}, embeddings, and
              data-store bindings are unchanged.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="New name"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRename}
              disabled={renaming || !renameValue.trim()}
            >
              {renaming ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog (two modes — processing-only vs full file) */}
      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDeleteMode === "file"
                ? "Delete this file entirely?"
                : "Delete the processing only?"}
            </DialogTitle>
            <DialogDescription>
              {doc && confirmDeleteMode === "file" && (
                <>
                  {/* THE DOOR LAW on a DESTRUCTIVE confirm: this is about to
                      delete the source file and everything derived from it, and
                      named the document as flat text with `doc.id` right there.
                      Sibling controls with alwaysShowActions — a same-tab link
                      would abandon the confirm, and a dialog has no hover
                      affordance to discover. */}
                  Removes{" "}
                  <strong className="inline-flex items-center gap-1 align-middle">
                    {doc.name}
                    <EntityDoorControls
                      token="processed_document"
                      id={doc.id}
                      name={doc.name}
                      alwaysShowActions
                      className="shrink-0"
                    />
                  </strong>
                  :
                  <ul className="list-disc ml-5 mt-2 space-y-0.5 text-xs">
                    <li>{doc.pagesPersisted} extracted pages</li>
                    <li>
                      {doc.chunks} {RAG_VOCAB.segmentsShort.toLowerCase()} ·{" "}
                      {doc.embeddingsOai} embeddings
                    </li>
                    <li>
                      The source file in cloud storage (soft-deleted; the binary
                      is removed by the cleanup job)
                    </li>
                    <li>All data-store bindings pointing to this file</li>
                  </ul>
                  <p className="text-destructive mt-3 text-sm">
                    This cannot be undone.
                  </p>
                </>
              )}
              {doc && confirmDeleteMode === "processing" && (
                <>
                  Removes <strong>{doc.pagesPersisted}</strong> extracted pages
                  and <strong>{doc.chunks}</strong>{" "}
                  {RAG_VOCAB.segmentsShort.toLowerCase()} for{" "}
                  <strong>{doc.name}</strong>. The original file is{" "}
                  <strong>kept</strong> — re-process anytime to rebuild.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting
                ? "Deleting…"
                : confirmDeleteMode === "file"
                  ? "Delete file"
                  : "Delete processing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CountChip({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: "ok" | "warning";
}) {
  return (
    <div
      className={
        "rounded-md border p-2 flex flex-col gap-0.5 " +
        (highlight === "warning"
          ? "border-yellow-500/50 bg-yellow-500/5"
          : "bg-muted/30")
      }
    >
      <span className="flex items-center gap-1 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-semibold text-sm text-foreground">{value}</span>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] text-sm gap-2">
      <span className="text-muted-foreground">{k}</span>
      <div className="min-w-0 break-words">{v}</div>
    </div>
  );
}

// Page + chunk payloads — DERIVED from the generated contract (never hand-mirrored).
type ApiFullPage = components["schemas"]["LibraryFullPage"];
type ApiChunkRow = components["schemas"]["LibraryChunkRow"];

/** Loads full page bodies (detail list payload is preview-only). */
function SheetFullPagePreviews({
  documentId,
  pageIndex,
  fallbackCleaned,
  fallbackRaw,
}: {
  documentId: string;
  pageIndex: number;
  fallbackCleaned: string;
  fallbackRaw: string;
}) {
  const [cleaned, setCleaned] = useState<string>("");
  const [raw, setRaw] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const openDiff = useOpenDiffViewerWindow();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCleaned("");
    setRaw("");
    (async () => {
      try {
        const supabase = createClient();
        const { data, error: rpcError } = await ragDb(supabase).rpc(
          "fn_get_library_full_page",
          { p_id: documentId, p_page_index: pageIndex },
        );
        if (cancelled) return;
        if (rpcError) throw new Error("We couldn't load this page's text.");
        const page = data as unknown as {
          cleaned_text: string;
          raw_text: string;
        } | null;
        if (!page) return;
        setCleaned(page.cleaned_text);
        setRaw(page.raw_text);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load page text",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId, pageIndex]);

  if (error) {
    return (
      <div className="space-y-2 text-xs">
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {error}. Showing summary preview only — open Preview for guaranteed
          full text.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <PreviewBlock
            label="Cleaned"
            text={fallbackCleaned}
            agentData={{
              processedDocumentId: documentId,
              pageNumber: pageIndex + 1,
              textKind: "cleaned-preview",
              text: fallbackCleaned,
            }}
          />
          <PreviewBlock
            label="Raw"
            text={fallbackRaw}
            agentData={{
              processedDocumentId: documentId,
              pageNumber: pageIndex + 1,
              textKind: "raw-preview",
              text: fallbackRaw,
            }}
          />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <p className="text-muted-foreground italic text-xs">
        Loading full page text…
      </p>
    );
  }

  return (
    <div className="space-y-2 text-xs">
      {cleaned && raw && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              openDiff({
                original: raw,
                modified: cleaned,
                originalLabel: "Raw",
                modifiedLabel: "Cleaned",
                title: `Raw vs cleaned · page ${pageIndex + 1}`,
                engine: "light",
                language: "markdown",
                defaultView: "split",
              })
            }
            className="h-7 gap-1.5"
            title="Compare the raw extraction with the cleaned text"
          >
            <GitCompareArrows className="h-3.5 w-3.5" />
            Compare
          </Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <PreviewBlock
          label="Cleaned"
          text={cleaned}
          agentData={{
            processedDocumentId: documentId,
            pageNumber: pageIndex + 1,
            textKind: "cleaned",
            text: cleaned,
          }}
        />
        <PreviewBlock
          label="Raw"
          text={raw}
          agentData={{
            processedDocumentId: documentId,
            pageNumber: pageIndex + 1,
            textKind: "raw",
            text: raw,
          }}
        />
      </div>
    </div>
  );
}

/** Loads full chunk bodies for the sample set (detail payload is preview-only). */
function SheetChunksPanel({
  documentId,
  fallbackSamples,
}: {
  documentId: string;
  fallbackSamples: LibraryChunkPreview[];
}) {
  const [rows, setRows] = useState<ApiChunkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (fallbackSamples.length === 0) return undefined;
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    setRows([]);
    const limit = Math.min(Math.max(fallbackSamples.length, 1), 500);

    (async () => {
      try {
        const supabase = createClient();
        const { data, error: rpcError } = await ragDb(supabase).rpc(
          "fn_list_library_chunks",
          { p_id: documentId, p_limit: limit, p_offset: 0 },
        );
        if (cancelled) return;
        if (rpcError) {
          throw new Error(
            `We couldn't load this document's ${RAG_VOCAB.segmentsShort.toLowerCase()}.`,
          );
        }
        const resp = data as unknown as { chunks: ApiChunkRow[] } | null;
        setRows(Array.isArray(resp?.chunks) ? resp.chunks : []);
      } catch (err) {
        if (!cancelled) {
          setFetchError(
            err instanceof Error
              ? err.message
              : `Failed to load ${RAG_VOCAB.segmentsShort.toLowerCase()}`,
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [documentId, fallbackSamples.length]);

  if (fallbackSamples.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No segments yet — extraction completed but{" "}
        {RAG_VOCAB.segmentation.toLowerCase()} has not run, or it failed.
      </p>
    );
  }

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Loading full segment text…
      </p>
    );
  }

  const useApi = rows.length > 0 && !fetchError;

  const listForRender: Array<
    | { source: "api"; row: ApiChunkRow }
    | { source: "fallback"; row: LibraryChunkPreview }
  > = useApi
    ? rows.map((row) => ({ source: "api", row }))
    : fallbackSamples.map((row) => ({ source: "fallback", row }));

  return (
    <>
      {fetchError && (
        <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">
          {fetchError}. Showing abbreviated previews from document summary —
          open <span className="font-medium">Preview</span> for full segments.
        </p>
      )}
      <div className="space-y-3">
        {listForRender.map((entry) =>
          entry.source === "api" ? (
            <div
              key={entry.row.id}
              className="border rounded-md p-3 space-y-2 bg-card"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">#{entry.row.chunk_index ?? "?"}</Badge>
                <MatrxUuidCell value={entry.row.id} label="Segment ID" />
                {entry.row.chunk_kind && (
                  <Badge variant="outline">{entry.row.chunk_kind}</Badge>
                )}
                {entry.row.token_count != null && (
                  <Badge variant="outline">
                    {entry.row.token_count.toLocaleString()} tok
                  </Badge>
                )}
                {entry.row.page_numbers &&
                  entry.row.page_numbers.length > 0 && (
                    <Badge variant="outline">
                      pp.{" "}
                      {entry.row.page_numbers.length === 1
                        ? entry.row.page_numbers[0]
                        : `${entry.row.page_numbers[0]}–${entry.row.page_numbers[entry.row.page_numbers.length - 1]}`}
                    </Badge>
                  )}
                <span className="ml-auto flex gap-1">
                  {entry.row.has_oai_embedding && (
                    <Badge variant="success">OAI</Badge>
                  )}
                  {entry.row.has_voyage_embedding && (
                    <Badge variant="success">Voyage</Badge>
                  )}
                  {!entry.row.has_oai_embedding &&
                    !entry.row.has_voyage_embedding && (
                      <Badge variant="error">no embedding</Badge>
                    )}
                </span>
              </div>
              <PreviewBlock
                label="Segment text"
                text={entry.row.content_text}
                agentData={{
                  processedDocumentId: documentId,
                  segment: entry.row,
                }}
              />
            </div>
          ) : (
            <div
              key={entry.row.id}
              className="border rounded-md p-3 space-y-2 bg-card"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">#{entry.row.chunkIndex ?? "?"}</Badge>
                <MatrxUuidCell value={entry.row.id} label="Segment ID" />
                {entry.row.chunkKind && (
                  <Badge variant="outline">{entry.row.chunkKind}</Badge>
                )}
                {entry.row.tokenCount != null && (
                  <Badge variant="outline">
                    {entry.row.tokenCount.toLocaleString()} tok
                  </Badge>
                )}
                {entry.row.pageNumbers && entry.row.pageNumbers.length > 0 && (
                  <Badge variant="outline">
                    pp.{" "}
                    {entry.row.pageNumbers.length === 1
                      ? entry.row.pageNumbers[0]
                      : `${entry.row.pageNumbers[0]}–${entry.row.pageNumbers[entry.row.pageNumbers.length - 1]}`}
                  </Badge>
                )}
                <span className="ml-auto flex gap-1">
                  {entry.row.hasOaiEmbedding && (
                    <Badge variant="success">OAI</Badge>
                  )}
                  {entry.row.hasVoyageEmbedding && (
                    <Badge variant="success">Voyage</Badge>
                  )}
                  {!entry.row.hasOaiEmbedding &&
                    !entry.row.hasVoyageEmbedding && (
                      <Badge variant="error">no embedding</Badge>
                    )}
                </span>
              </div>
              <PreviewBlock
                label="Segment preview"
                text={entry.row.contentPreview}
                agentData={{
                  processedDocumentId: documentId,
                  segment: entry.row,
                  previewOnly: true,
                }}
              />
            </div>
          ),
        )}
      </div>
    </>
  );
}

function PreviewBlock({
  label,
  text,
  agentData,
}: {
  label: string;
  text: string;
  agentData?: unknown;
}) {
  return (
    <div className="space-y-1">
      <div className="flex min-h-7 items-center justify-between gap-2">
        {label ? (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
        ) : (
          <span />
        )}
        <CopyButtons
          size="icon"
          label={label || "document text"}
          human={() => text}
          agent={() => ({
            kind: "rag-document-content",
            location: "AI Matrx — RAG Document Library — Detail panel",
            description: `${label || "Document text"} from the open processed document.`,
            data: agentData ?? { text },
            attributes: { "content-kind": label || "text" },
          })}
          disabled={!text}
        />
      </div>
      <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed bg-muted/30 rounded p-2 overflow-x-auto">
        {text || <span className="italic text-muted-foreground">(empty)</span>}
      </pre>
    </div>
  );
}
