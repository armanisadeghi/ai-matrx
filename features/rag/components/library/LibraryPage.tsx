"use client";

/**
 * /rag/library — visibility surface for processed documents.
 *
 * The "where did my content go?" page. One table, one truth. Every
 * processed_documents row owned by the caller, with derived counts
 * and a status badge. Clicking a row opens the detail sheet.
 *
 * Premium chrome:
 *   - Animated KPI rollup tiles (count-up, tone glow, pulse on growth)
 *   - Inline "Active processing" strip above the table — shows live
 *     stage + progress + percent for any number of concurrent jobs
 *     without touching the document table layout
 *   - Right-side ProcessingProgressSheet replaces the old full-screen
 *     dialog (matches the rest of the app's tab/sheet pattern)
 *   - Live polling: while any job is running or any doc on screen has a
 *     non-terminal status, both the list and the rollup totals refresh
 *     every 4 seconds (visibility-aware — pauses in background tabs)
 *   - Row pulse: a row briefly flashes when its status changes during
 *     polling so the user actually notices "embedding → ready"
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  Database,
  ExternalLink,
  FileText,
  Layers,
  RefreshCw,
  Search,
  Sparkles,
  AlertTriangle,
  Trash2,
  Upload,
  Search as SearchAction,
  MoreHorizontal,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { fileHandler } from "@/features/files";
import { useProcessingRunner } from "@/features/rag/hooks/useProcessingRunner";
import { ProcessingProgressSheet } from "./ProcessingProgressSheet";
import { ActiveJobsStrip } from "./ActiveJobsStrip";
import { AnimatedKpiCard } from "./AnimatedKpiCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { postJson } from "@/lib/python-client";
import { useLibrary, useLibrarySummary } from "@/features/rag/hooks/useLibrary";
import type {
  DocStatus,
  LibraryDocSummary,
} from "@/features/rag/types/library";
import { StatusBadge } from "./StatusBadge";
import { LibraryDocDetailSheet } from "./LibraryDocDetailSheet";
import { QuickSearchDialog } from "./QuickSearchDialog";
import { cn } from "@/lib/utils";

const STATUS_FILTERS: { value: DocStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ready", label: "Ready" },
  { value: "embedding", label: "Embedding" },
  { value: "extracted", label: "Extracted" },
  { value: "pending", label: "Pending / failed" },
];

/** A doc is in a "non-terminal" state if it could still be making progress
 *  on the server. While any visible doc is in this set we poll the list. */
const NON_TERMINAL: DocStatus[] = [
  "embedding",
  "chunking",
  "extracted",
  "pending",
];

/** Poll cadence (ms) when the list/summary are auto-refreshing. */
const POLL_INTERVAL_MS = 4000;

export function LibraryPage() {
  const search = useSearchParams();

  // Read the initial doc_id from the URL exactly once, then own selection
  // in component state. We DO NOT reflect selection back to the URL here —
  // an effect that calls `router.replace` while listing `search` and
  // `router` in its deps creates an infinite navigation loop in the
  // App Router (router.replace mutates the search-params reference, which
  // re-fires the effect, which calls router.replace again, ad infinitum).
  // For deep links: opening `/rag/library?doc_id=<uuid>` still works
  // because of the snapshot below. Re-syncing on click is intentionally
  // skipped — keep it lean for the demo.
  const initialDocIdRef = useRef<string | null>(search?.get("doc_id") ?? null);

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<DocStatus | "all">("all");
  const [selectedDocId, setSelectedDocId] = useState<string | null>(
    initialDocIdRef.current,
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [bulkConfirmStatus, setBulkConfirmStatus] = useState<DocStatus | null>(
    null,
  );
  const [bulkRunning, setBulkRunning] = useState(false);
  const [searchDocId, setSearchDocId] = useState<string | null>(null);
  const [searchDocName, setSearchDocName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  // ----- multi-job runner ------------------------------------------------
  const runner = useProcessingRunner();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [focusJobId, setFocusJobId] = useState<string | null>(null);

  // Open the OS file picker — single button, no extra dialog.
  const handleOpenPicker = () => fileInputRef.current?.click();

  // Upload a file directly from the library, then kick the full pipeline.
  // Adds a job to the runner and opens the side sheet focused on it.
  const handleFilePicked = async (file: File) => {
    setUploading(true);
    const tid = toast.loading(`Uploading ${file.name}…`);
    try {
      const normalized = await fileHandler.upload(
        { kind: "file", file },
        { visibility: "private" },
      );
      toast.dismiss(tid);
      if (!normalized.fileId) {
        toast.error("Upload succeeded but no file_id returned");
        return;
      }
      toast.success("Upload complete — pipeline starting");
      setRefreshKey((n) => n + 1);
      const jobId = await runner.runForCldFile(
        normalized.fileId,
        file.name,
        "Upload + full pipeline (extract → clean → chunk → embed)",
      );
      setFocusJobId(jobId);
      setSheetOpen(true);
    } catch (err) {
      toast.dismiss(tid);
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleBulkDelete = async (status: DocStatus) => {
    setBulkRunning(true);
    try {
      const { data } = await postJson<
        {
          deleted_documents: number;
          deleted_pages: number;
          deleted_chunks: number;
        },
        { status: string }
      >("/rag/library/bulk-delete", { status });
      toast.success(
        `Deleted ${data?.deleted_documents ?? 0} ${status} documents (${data?.deleted_pages ?? 0} pages, ${data?.deleted_chunks ?? 0} chunks)`,
      );
      setBulkConfirmStatus(null);
      setRefreshKey((n) => n + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk delete failed");
    } finally {
      setBulkRunning(false);
    }
  };

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Poll while any job is running OR any visible doc has a non-terminal
  // status. We derive `pollMs` from a state flag (updated AFTER each
  // fetch) instead of from the `docs` array directly so we can use a
  // single useLibrary call without rendering loops.
  const [hasNonTerminalDocs, setHasNonTerminalDocs] = useState(false);
  const pollMs = runner.hasActive || hasNonTerminalDocs ? POLL_INTERVAL_MS : 0;

  const {
    docs: finalDocs,
    total: finalTotal,
    loading: finalLoading,
    error: finalError,
  } = useLibrary({
    search: debouncedSearch || undefined,
    status: statusFilter === "all" ? null : statusFilter,
    limit: 100,
    offset: 0,
    refreshKey,
    pollMs,
  });

  // After each fetch, recompute whether anything visible is still in flight.
  useEffect(() => {
    const inFlight = finalDocs.some((d) => NON_TERMINAL.includes(d.status));
    setHasNonTerminalDocs(inFlight);
  }, [finalDocs]);

  const { summary, loading: summaryLoading } = useLibrarySummary({
    refreshKey,
    pollMs,
  });

  // ----- row pulse on status change --------------------------------------
  const prevStatusRef = useRef<Map<string, DocStatus>>(new Map());
  const [pulsedRows, setPulsedRows] = useState<Set<string>>(new Set());
  useEffect(() => {
    const transitioned: string[] = [];
    for (const d of finalDocs) {
      const prev = prevStatusRef.current.get(d.id);
      if (prev && prev !== d.status) transitioned.push(d.id);
      prevStatusRef.current.set(d.id, d.status);
    }
    if (transitioned.length === 0) return;
    setPulsedRows((prev) => {
      const next = new Set(prev);
      for (const id of transitioned) next.add(id);
      return next;
    });
    const t = window.setTimeout(() => {
      setPulsedRows((prev) => {
        const next = new Set(prev);
        for (const id of transitioned) next.delete(id);
        return next;
      });
    }, 1800);
    return () => window.clearTimeout(t);
  }, [finalDocs]);

  // ----- runner-driven refreshes -----------------------------------------
  // When a job finishes, do an immediate explicit refresh so counts update
  // without waiting for the next poll tick.
  const lastTerminalCountRef = useRef(0);
  useEffect(() => {
    const terminalCount = runner.jobs.filter(
      (j) => j.status !== "running",
    ).length;
    if (terminalCount > lastTerminalCountRef.current) {
      setRefreshKey((n) => n + 1);
    }
    lastTerminalCountRef.current = terminalCount;
  }, [runner.jobs]);

  // ----- helpers ---------------------------------------------------------
  const openSheetForJob = (jobId: string) => {
    setFocusJobId(jobId);
    setSheetOpen(true);
  };

  const handleRequestStageRun = async (
    stage: "extract" | "clean" | "chunk" | "embed" | "run_all",
    docId: string,
    docName: string,
  ) => {
    const subtitle =
      stage === "extract"
        ? "Re-extract pages from the cloud file"
        : stage === "clean"
          ? "LLM cleanup + section classification"
          : stage === "chunk"
            ? "Page-aware hierarchical chunking"
            : stage === "embed"
              ? "Embed any chunks missing a vector"
              : "Full pipeline";
    const jobId = await runner.runStage(docId, stage, docName, subtitle);
    setFocusJobId(jobId);
    // If the user is already inside the doc-detail sheet for this doc,
    // the inline ProcessingJobView in the Stages tab will pick up the
    // new job automatically. Don't open a second sheet — that's what
    // caused the jarring width-change the user complained about.
    if (selectedDocId !== docId) {
      setSheetOpen(true);
    }
  };

  // Jobs scoped to the currently-open doc — the detail sheet renders these
  // inline in its Stages tab. Includes terminal jobs the user hasn't
  // dismissed so the success / error result panel stays visible.
  const docScopedJobs = useMemo(() => {
    if (!selectedDocId) return [];
    return runner.jobs.filter((j) => j.processedDocumentId === selectedDocId);
  }, [runner.jobs, selectedDocId]);

  const headerStats = useMemo(
    () => ({
      total: summary?.documentsTotal ?? 0,
      ready: summary?.documentsReady ?? 0,
      embedding: summary?.documentsEmbedding ?? 0,
      extracted: summary?.documentsExtracted ?? 0,
      pending: summary?.documentsPending ?? 0,
      chunks: summary?.chunks ?? 0,
      dataStores: summary?.dataStores ?? 0,
    }),
    [summary],
  );

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] bg-textured">
      {/* Header — stays put while the table area scrolls */}
      <header className="border-b bg-background/60 backdrop-blur-sm">
        <div className="px-6 py-4 space-y-4">
          {/* Title + actions */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold flex items-center gap-2 tracking-tight">
                <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-primary/15 to-primary/5">
                  <FileText className="h-4 w-4 text-primary" />
                </span>
                Document Library
                {pollMs > 0 && (
                  <Badge
                    variant="outline"
                    className="text-[10px] gap-1 px-1.5 py-0 h-5 border-primary/40"
                  >
                    <span className="relative inline-flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                    </span>
                    Live
                  </Badge>
                )}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Every document you've processed for RAG. Status, page counts,
                chunks, embeddings, and data-store bindings — all in one place.
              </p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="application/pdf,image/*,text/*,.md,.txt"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFilePicked(f);
                }}
              />
              <Button
                size="sm"
                onClick={handleOpenPicker}
                disabled={uploading}
                className="gap-1.5"
              >
                <Upload className="h-3.5 w-3.5" />
                {uploading ? "Uploading…" : "Upload & process"}
              </Button>
              {runner.jobs.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setFocusJobId(null);
                    setSheetOpen(true);
                  }}
                  className="gap-1.5"
                >
                  <Activity className="h-3.5 w-3.5" />
                  Jobs
                  <Badge
                    variant={
                      runner.activeJobs.length > 0 ? "info" : "secondary"
                    }
                    className="ml-0.5 text-[10px] px-1 py-0 h-4"
                  >
                    {runner.activeJobs.length > 0
                      ? runner.activeJobs.length
                      : runner.jobs.length}
                  </Badge>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRefreshKey((n) => n + 1)}
                title="Refresh"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open("/rag/data-stores", "_blank")}
                className="gap-1.5"
              >
                <Database className="h-3.5 w-3.5" />
                Data Stores
                <ExternalLink className="h-3 w-3 opacity-60" />
              </Button>
            </div>
          </div>

          {/* Animated KPI rollup */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
            <AnimatedKpiCard
              icon={<FileText className="h-3.5 w-3.5" />}
              label="Documents"
              value={headerStats.total}
              loading={summaryLoading}
              tone="primary"
            />
            <AnimatedKpiCard
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              label="Ready"
              value={headerStats.ready}
              loading={summaryLoading}
              tone="success"
            />
            <AnimatedKpiCard
              icon={<Sparkles className="h-3.5 w-3.5" />}
              label="Embedding"
              value={headerStats.embedding}
              loading={summaryLoading}
              tone="info"
            />
            <AnimatedKpiCard
              icon={<FileText className="h-3.5 w-3.5" />}
              label="Extracted only"
              value={headerStats.extracted}
              loading={summaryLoading}
              tone="warning"
            />
            <AnimatedKpiCard
              icon={<AlertTriangle className="h-3.5 w-3.5" />}
              label="Pending / failed"
              value={headerStats.pending}
              loading={summaryLoading}
              tone="error"
            />
            <AnimatedKpiCard
              icon={<Layers className="h-3.5 w-3.5" />}
              label="Total chunks"
              value={headerStats.chunks}
              loading={summaryLoading}
              tone="neutral"
            />
            <AnimatedKpiCard
              icon={<Database className="h-3.5 w-3.5" />}
              label="Data stores"
              value={headerStats.dataStores}
              loading={summaryLoading}
              tone="neutral"
            />
          </div>

          {/* Inline live-jobs strip */}
          <ActiveJobsStrip
            jobs={runner.jobs}
            onOpen={openSheetForJob}
            onCancel={runner.cancel}
            onDismiss={runner.dismiss}
            onOpenAll={() => {
              setFocusJobId(null);
              setSheetOpen(true);
            }}
          />

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name…"
                className="pl-8 h-8"
              />
            </div>
            <div className="relative flex gap-0.5 rounded-md border bg-card p-0.5">
              {STATUS_FILTERS.map((f) => {
                const active = statusFilter === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setStatusFilter(f.value)}
                    className={cn(
                      "relative px-2.5 py-1 text-xs rounded font-medium transition-colors",
                      active
                        ? "text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="status-filter-active"
                        className="absolute inset-0 rounded bg-primary"
                        transition={{
                          duration: 0.25,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      />
                    )}
                    <span className="relative">{f.label}</span>
                  </button>
                );
              })}
            </div>

            {(headerStats.pending ?? 0) > 0 && (
              <Button
                size="sm"
                variant="destructive"
                className="ml-auto h-8"
                onClick={() => setBulkConfirmStatus("pending")}
                disabled={bulkRunning}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Clear {headerStats.pending} pending
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto">
        {finalError && (
          <div className="m-6 p-4 border border-destructive/50 bg-destructive/5 rounded-md text-sm text-destructive">
            <strong>Could not load library:</strong> {finalError}
          </div>
        )}

        {finalLoading && finalDocs.length === 0 ? (
          <div className="p-6 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : finalDocs.length === 0 ? (
          <EmptyState searching={Boolean(debouncedSearch)} />
        ) : (
          <Table>
            <TableHeader className="sticky top-0 bg-background/95 backdrop-blur z-10">
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Pages</TableHead>
                <TableHead className="text-right">Chunks</TableHead>
                <TableHead className="text-right">Embeds</TableHead>
                <TableHead className="text-right">Stores</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {finalDocs.map((d) => (
                <DocRow
                  key={d.id}
                  doc={d}
                  pulsed={pulsedRows.has(d.id)}
                  onSelect={() => setSelectedDocId(d.id)}
                  onSearch={() => {
                    setSearchDocId(d.id);
                    setSearchDocName(d.name);
                  }}
                />
              ))}
            </TableBody>
          </Table>
        )}

        {!finalLoading &&
          finalDocs.length > 0 &&
          finalTotal > finalDocs.length && (
            <p className="px-6 py-3 text-xs text-muted-foreground italic">
              Showing first {finalDocs.length} of {finalTotal} documents.
            </p>
          )}
      </div>

      <LibraryDocDetailSheet
        processedDocumentId={selectedDocId}
        onClose={() => setSelectedDocId(null)}
        onMutated={() => setRefreshKey((n) => n + 1)}
        onRequestStageRun={(stage, docId, docName) => {
          void handleRequestStageRun(stage, docId, docName);
        }}
        activeJobs={docScopedJobs}
        onCancelJob={runner.cancel}
        onDismissJob={runner.dismiss}
      />

      <QuickSearchDialog
        open={searchDocId !== null}
        onOpenChange={(o) => {
          if (!o) {
            setSearchDocId(null);
            setSearchDocName(null);
          }
        }}
        processedDocumentId={searchDocId}
        documentName={searchDocName}
      />

      <ProcessingProgressSheet
        open={sheetOpen}
        onOpenChange={(o) => {
          setSheetOpen(o);
          if (!o) setRefreshKey((n) => n + 1);
        }}
        jobs={runner.jobs}
        focusJobId={focusJobId}
        onCancel={runner.cancel}
        onDismiss={runner.dismiss}
        onCancelAll={runner.cancelAll}
        onDismissAll={runner.dismissAll}
      />

      {/* Bulk-delete confirm dialog */}
      <Dialog
        open={bulkConfirmStatus !== null}
        onOpenChange={(o) => {
          if (!o) setBulkConfirmStatus(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete all {bulkConfirmStatus} documents?</DialogTitle>
            <DialogDescription>
              {bulkConfirmStatus === "pending" && (
                <>
                  This will delete every document of yours where ingestion
                  failed before any pages were persisted. The original files in
                  cloud storage are <strong>not</strong> touched — only the
                  failed processing rows.
                </>
              )}
              {bulkConfirmStatus === "extracted" && (
                <>
                  This will delete every document where pages were extracted but
                  chunking never ran. Re-process to rebuild.
                </>
              )}
              {bulkConfirmStatus === "embedding" && (
                <>
                  This will delete every document where embeddings are still
                  partially missing. Re-process to rebuild.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkConfirmStatus(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (bulkConfirmStatus) handleBulkDelete(bulkConfirmStatus);
              }}
              disabled={bulkRunning}
            >
              {bulkRunning ? "Deleting…" : "Delete all"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row — extracted so the pulse animation can live in its own re-render scope
// ---------------------------------------------------------------------------

function DocRow({
  doc,
  pulsed,
  onSelect,
  onSearch,
}: {
  doc: LibraryDocSummary;
  pulsed: boolean;
  onSelect: () => void;
  onSearch: () => void;
}) {
  const isInFlight =
    doc.status === "embedding" ||
    doc.status === "chunking" ||
    doc.status === "extracted" ||
    doc.status === "pending";

  const embedPct =
    doc.chunks > 0 ? Math.min(100, (doc.embeddingsOai / doc.chunks) * 100) : 0;
  const embedPartial = doc.chunks > 0 && doc.embeddingsOai < doc.chunks;

  return (
    <TableRow
      onClick={onSelect}
      className={cn(
        "cursor-pointer hover:bg-accent/50 relative transition-colors",
      )}
    >
      <TableCell className="max-w-md relative">
        {/* Subtle left accent rail when in-flight */}
        {isInFlight && (
          <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-gradient-to-b from-sky-500 via-violet-500 to-emerald-500" />
        )}
        {/* Row pulse on status change */}
        <AnimatePresence>
          {pulsed && (
            <motion.span
              key="pulse"
              className="pointer-events-none absolute inset-0 rounded bg-emerald-500/15"
              initial={{ opacity: 0.85 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.6, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>
        <div className="font-medium break-words pl-2">{doc.name}</div>
        <div className="text-xs text-muted-foreground flex items-center gap-2 pl-2">
          <span>{doc.sourceKind}</span>
          {doc.derivationKind !== "initial_extract" && (
            <Badge variant="outline" className="text-[10px] px-1 py-0">
              {doc.derivationKind}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        <StatusBadge status={doc.status} />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {doc.pagesPersisted}
        {doc.totalPages != null && doc.totalPages !== doc.pagesPersisted && (
          <span className="text-muted-foreground"> / {doc.totalPages}</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {doc.chunks.toLocaleString()}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <div className="flex flex-col items-end gap-0.5">
          <span
            className={cn(
              "font-medium",
              embedPartial && "text-amber-600 dark:text-amber-400",
            )}
          >
            {doc.embeddingsOai.toLocaleString()}
            {embedPartial && (
              <span className="text-muted-foreground"> / {doc.chunks}</span>
            )}
          </span>
          {embedPartial && (
            <div className="h-0.5 w-12 overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full bg-gradient-to-r from-amber-500 to-amber-400"
                initial={{ width: 0 }}
                animate={{ width: `${embedPct}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        {doc.dataStoreCount > 0 ? (
          <Badge variant="info">{doc.dataStoreCount}</Badge>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
        {formatRelative(doc.createdAt)}
      </TableCell>
      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            title="Search inside this document"
            disabled={doc.chunks === 0}
            onClick={onSearch}
          >
            <SearchAction className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            title="Open detail panel"
            onClick={onSelect}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ searching }: { searching: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-6">
      <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/10 to-primary/0">
        <FileText className="h-6 w-6 text-primary/70" />
        <span className="absolute inset-0 rounded-full ring-2 ring-primary/15 animate-pulse" />
      </div>
      <h3 className="text-base font-semibold">
        {searching ? "No matches" : "No documents processed yet"}
      </h3>
      <p className="text-sm text-muted-foreground max-w-md mt-1">
        {searching
          ? "Try clearing your search or status filter."
          : "Upload a file with the button above, or open the Data Stores page. New documents appear here the moment ingestion starts."}
      </p>
    </div>
  );
}

function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return iso;
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
