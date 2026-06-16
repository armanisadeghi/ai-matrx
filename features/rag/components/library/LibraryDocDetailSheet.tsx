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

import { useEffect, useState } from "react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
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
  Copy,
  Check,
  Database,
  FileText,
  Layers,
  Trash2,
  Pencil,
  RefreshCw,
  Sparkles,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { del, getJson, patchJson, postJson } from "@/lib/python-client";
import { StatusBadge } from "./StatusBadge";
import { StageStatusPills } from "./StageStatusPills";
import { useLibraryDoc } from "@/features/rag/hooks/useLibrary";
import type { LibraryChunkPreview } from "@/features/rag/types/library";
import type { StageName } from "@/features/rag/api/stages";
import type { ProcessingJob } from "@/features/rag/hooks/useProcessingRunner";
import { ProcessingJobView } from "./ProcessingJobView";

export interface LibraryDocDetailSheetProps {
  processedDocumentId: string | null;
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
  onClose,
  onMutated,
  onRequestStageRun,
  activeJobs,
  onCancelJob,
  onDismissJob,
}: LibraryDocDetailSheetProps) {
  const { doc, loading, error, reload } = useLibraryDoc(processedDocumentId);
  const [copiedId, setCopiedId] = useState(false);
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
      await patchJson(`/rag/library/${doc.id}`, { name: renameValue.trim() });
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
      if (confirmDeleteMode === "file") {
        // Full delete — processing + source cld_files row.
        const { data } = await del<{
          deleted_documents: number;
          deleted_pages: number;
          deleted_chunks: number;
          deleted_cld_file: boolean;
        }>(`/rag/library/${doc.id}/full`);
        toast.success(
          data?.deleted_cld_file
            ? `File deleted: ${data?.deleted_pages ?? 0} pages, ${data?.deleted_chunks ?? 0} chunks, source file moved to trash.`
            : `Processing deleted: ${data?.deleted_pages ?? 0} pages, ${data?.deleted_chunks ?? 0} chunks. (Source file was not a cld_files row, so the binary stays.)`,
        );
      } else {
        // Processing-only delete — keeps the source binary.
        const { data } = await del<{
          deleted_documents: number;
          deleted_pages: number;
          deleted_chunks: number;
        }>(`/rag/library/${doc.id}`);
        toast.success(
          `Processing deleted: ${data?.deleted_pages ?? 0} pages, ${data?.deleted_chunks ?? 0} chunks. Source file intact — re-process to rebuild.`,
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
    loading || !doc ? "Loading document…" : error ? "Error" : doc.name;

  const panelDescription = error ? (
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
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            navigator.clipboard.writeText(doc.id);
            setCopiedId(true);
            toast.success("Document ID copied");
            setTimeout(() => setCopiedId(false), 1500);
          }}
        >
          {copiedId ? (
            <Check className="h-3.5 w-3.5 mr-1" />
          ) : (
            <Copy className="h-3.5 w-3.5 mr-1" />
          )}
          Copy ID
        </Button>
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
        {loading || !doc ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : error ? null : (
          <>
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
                    title={`${doc.embeddingsOai} of ${doc.chunks} chunks have embeddings — run the pipeline to finish.`}
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
                    title="Remove processing artifacts (chunks, embeddings) but keep the source file. Re-process to rebuild."
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
                  label="Chunks"
                  value={String(doc.chunks)}
                />
                <CountChip
                  icon={<Sparkle />}
                  label="OAI emb."
                  value={`${doc.embeddingsOai} / ${doc.chunks}`}
                  highlight={
                    doc.chunks > 0 && doc.embeddingsOai < doc.chunks
                      ? "warning"
                      : "ok"
                  }
                />
                <CountChip
                  icon={<Sparkle />}
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
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="pages">
                  Pages ({doc.pagesPersisted})
                </TabsTrigger>
                <TabsTrigger value="chunks">Chunks ({doc.chunks})</TabsTrigger>
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
                            <strong className="text-foreground">Chunks</strong>{" "}
                            — pages are split into retrievable, page-aware
                            pieces (<em>Chunk</em> action).
                          </li>
                          <li>
                            <strong className="text-foreground">Vectors</strong>{" "}
                            — each chunk gets an embedding for similarity search
                            (<em>Embed</em> action).
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
                value="overview"
                className="flex-1 min-h-0 mt-2 px-6 pb-6"
              >
                <ScrollArea className="h-full">
                  <div className="space-y-4 pr-3">
                    <Section title="Identity">
                      <KV
                        k="Document ID"
                        v={<code className="text-xs">{doc.id}</code>}
                      />
                      <KV
                        k="Source"
                        v={
                          <span>
                            {doc.sourceKind} ·{" "}
                            <code className="text-xs">{doc.sourceId}</code>
                          </span>
                        }
                      />
                      <KV k="MIME" v={doc.mimeType ?? "—"} />
                      <KV
                        k="Storage URI"
                        v={
                          doc.storageUri ? (
                            <code className="text-xs break-all">
                              {doc.storageUri}
                            </code>
                          ) : (
                            "—"
                          )
                        }
                      />
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
                            <code className="text-xs">
                              {doc.parentProcessedId}
                            </code>
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
                            <Badge
                              key={s.dataStoreId}
                              variant="secondary"
                              className="cursor-pointer"
                              onClick={() => {
                                window.open(
                                  `/rag/data-stores?store_id=${s.dataStoreId}`,
                                  "_blank",
                                );
                              }}
                            >
                              <Database className="h-3 w-3 mr-1" />
                              {s.name}
                              {s.shortCode ? ` · ${s.shortCode}` : ""}
                            </Badge>
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
                        No chunks yet — extraction completed but chunking has
                        not run, or it failed.
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
                        chunks.
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
              The name is the display label only — chunks, embeddings, and
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
                  Removes <strong>{doc.name}</strong>:
                  <ul className="list-disc ml-5 mt-2 space-y-0.5 text-xs">
                    <li>{doc.pagesPersisted} extracted pages</li>
                    <li>
                      {doc.chunks} chunks · {doc.embeddingsOai} embeddings
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
                  and <strong>{doc.chunks}</strong> chunks for{" "}
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

interface ApiFullPage {
  cleaned_text: string;
  raw_text: string;
}

interface ApiChunkRow {
  id: string;
  chunk_index: number | null;
  chunk_kind: string | null;
  token_count: number | null;
  page_numbers: number[] | null;
  content_text: string;
  has_oai_embedding: boolean;
  has_voyage_embedding: boolean;
}

interface ApiChunksResponse {
  chunks: ApiChunkRow[];
  total: number;
  limit: number;
  offset: number;
}

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCleaned("");
    setRaw("");
    getJson<ApiFullPage>(`/rag/library/${documentId}/page/${pageIndex}`)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setCleaned(data.cleaned_text);
        setRaw(data.raw_text);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load page text",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
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
          <PreviewBlock label="Cleaned" text={fallbackCleaned} />
          <PreviewBlock label="Raw" text={fallbackRaw} />
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
      <PreviewBlock label="Cleaned" text={cleaned} />
      <PreviewBlock label="Raw" text={raw} />
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
    if (fallbackSamples.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    setRows([]);
    const limit = Math.min(Math.max(fallbackSamples.length, 1), 500);
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", "0");

    getJson<ApiChunksResponse>(
      `/rag/library/${documentId}/chunks?${params.toString()}`,
    )
      .then(({ data }) => {
        if (cancelled || !data) return;
        setRows(Array.isArray(data.chunks) ? data.chunks : []);
      })
      .catch((err) => {
        if (!cancelled) {
          setFetchError(
            err instanceof Error ? err.message : "Failed to load chunks",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [documentId, fallbackSamples.length]);

  if (fallbackSamples.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No chunks yet — extraction completed but chunking has not run, or it
        failed.
      </p>
    );
  }

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Loading full chunk text…
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
          open <span className="font-medium">Preview</span> for full chunks.
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
              <PreviewBlock label="" text={entry.row.content_text} />
            </div>
          ) : (
            <div
              key={entry.row.id}
              className="border rounded-md p-3 space-y-2 bg-card"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">#{entry.row.chunkIndex ?? "?"}</Badge>
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
              <PreviewBlock label="" text={entry.row.contentPreview} />
            </div>
          ),
        )}
      </div>
    </>
  );
}

function PreviewBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="space-y-1">
      {label && (
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      )}
      <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed bg-muted/30 rounded p-2 overflow-x-auto">
        {text || <span className="italic text-muted-foreground">(empty)</span>}
      </pre>
    </div>
  );
}

// Tiny inline icon to avoid pulling another import for the "Sparkle".
function Sparkle() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}
