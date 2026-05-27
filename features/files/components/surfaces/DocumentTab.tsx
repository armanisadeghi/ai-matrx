/**
 * features/files/components/surfaces/DocumentTab.tsx
 *
 * The "Document" tab inside PreviewPane.
 *
 * Three states, no fallback to a blank screen:
 *
 *   1. `found`        — file has a processed_documents row.
 *                       Renders an embedded `<DocumentViewer/>` (the
 *                       same 4-pane viewer at /rag/viewer/[id]) plus
 *                       an "Open full viewer" button that navigates
 *                       to /rag/viewer/<id>.
 *
 *   2. `absent`       — file is not yet ingested. Show a CTA card
 *                       with "Process this file for RAG" and
 *                       streaming progress.
 *
 *   3. `unavailable`  — endpoint not implemented or transient failure.
 *                       Show a soft message with a retry button. Don't
 *                       break the rest of the preview surface.
 *
 * The tab listens for two cross-component events:
 *
 *   - "cloud-files:document-processed" — fired by `useFileIngest` after
 *     a successful ingest. Triggers a re-probe so we transition from
 *     `absent → loading → found` automatically.
 *   - "cloud-files:reprocess-document" — fired by the file context menu
 *     ("Reprocess for RAG") or any toolbar button. Kicks off the
 *     streaming ingest from inside this tab, regardless of current
 *     state. Lets a user re-process an already-ingested file with one
 *     click.
 */

"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ExternalLink,
  Layers,
  Loader2,
  RotateCw,
  Rainbow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectFileById } from "@/features/files/redux/selectors";
import { DocumentViewer } from "@/features/rag/components/documents/DocumentViewer";
import { IngestFlowAnimation } from "@/features/rag/components/visualization/IngestFlowAnimation";
import { LibraryPreviewPage } from "@/features/rag/components/library/LibraryPreviewPage";
import { useFileDocument } from "@/features/files/hooks/useFileDocument";
import {
  onFileDocumentProcessed,
  useFileIngest,
  type UseFileIngestState,
} from "@/features/rag/hooks/useFileIngest";

export interface DocumentTabProps {
  fileId: string;
  className?: string;
  /** When the tab is hidden (other tab active) skip the heavy work. */
  active?: boolean;
  /**
   * Citation deep-link target. When the user opens a file from a search
   * result or chat citation, the chunk + page are forwarded into the
   * embedded `<DocumentViewer/>` so the right pane is highlighted on
   * first paint. The full-viewer link below preserves these too.
   */
  initialPage?: number;
  initialChunkId?: string;
}

export function DocumentTab({
  fileId,
  className,
  active,
  initialPage,
  initialChunkId,
}: DocumentTabProps) {
  const file = useAppSelector((s) => selectFileById(s, fileId));
  const { state, refresh } = useFileDocument(fileId);
  const ingest = useFileIngest(fileId);

  // Re-probe whenever ingest completes anywhere in the app.
  useEffect(() => {
    return onFileDocumentProcessed((processedFileId) => {
      if (processedFileId === fileId) refresh();
    });
  }, [fileId, refresh]);

  // External "reprocess" trigger: file context menu, toolbar, etc. Works
  // regardless of current state — flips an absent file to running, or
  // re-runs ingestion on an already-found document.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ fileId?: string; force?: boolean }>)
        .detail;
      if (!detail || detail.fileId !== fileId) return;
      void ingest.run({ force: detail.force ?? true });
    };
    window.addEventListener("cloud-files:reprocess-document", handler);
    return () =>
      window.removeEventListener("cloud-files:reprocess-document", handler);
  }, [fileId, ingest]);

  // Skip mounting the heavy DocumentViewer until the user clicks the tab.
  if (active === false) {
    return <div className={cn("h-full w-full", className)} />;
  }

  // While an ingest is in flight (or has just errored / completed), render
  // the in-tab pipeline animation — the same beautiful viz the user sees on
  // /rag/visualization, driven live by this file's progress. Replaces the
  // old "live progress in the corner" placeholder, which was a horrible
  // experience on a slow operation that the user is presumably watching.
  const ingestActive =
    ingest.status === "running" ||
    ingest.status === "error" ||
    ingest.status === "complete";
  if (ingestActive) {
    return (
      <IngestFlowAnimation
        fileName={file?.fileName ?? "this file"}
        ingest={ingest}
        onClose={() => {
          ingest.reset();
          refresh();
        }}
        className={className}
      />
    );
  }

  if (state.status === "loading" || state.status === "idle") {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center gap-2 text-sm text-muted-foreground",
          className,
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Looking up document…</span>
      </div>
    );
  }

  if (state.status === "absent") {
    return (
      <NotIngestedCard
        fileName={file?.fileName ?? null}
        ingest={ingest}
        className={className}
      />
    );
  }

  if (state.status === "unavailable") {
    return (
      <UnavailableCard
        reason={state.reason}
        onRetry={refresh}
        className={className}
      />
    );
  }

  // state.status === "found"
  const docId = state.doc.processed_document_id;
  return (
    <div className={cn("flex h-full w-full flex-col", className)}>
      <div className="flex items-center justify-between border-b border-border bg-muted/20 px-3 py-1 text-xs shrink-0">
        <span className="text-muted-foreground">
          {state.doc.derivation_kind} · {state.doc.total_pages ?? 0} pages
          {state.doc.chunk_count != null
            ? ` · ${state.doc.chunk_count} chunks`
            : ""}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void ingest.run({ force: true })}
            title="Force the full RAG pipeline to re-run end-to-end (streaming progress fills this panel below)."
            className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
          >
            <RotateCw className="h-3 w-3" />
            Reprocess
          </button>
          {/* Quick jump to the Library detail sheet — gives the user
              per-stage controls (extract / clean / chunk / embed),
              partial-resume buttons, the live inline ProcessingJobView,
              and the full Pages / Chunks browsers. The Reprocess
              button above is the one-shot "redo everything" path; the
              Library is for surgical re-runs. */}
          <Link
            href={`/rag/library?doc_id=${encodeURIComponent(docId)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
            title="Open per-stage controls in the Library"
          >
            <Layers className="h-3 w-3" />
            Stages
          </Link>
          <Link
            href={(() => {
              const qs = new URLSearchParams();
              if (initialPage) qs.set("page", String(initialPage));
              if (initialChunkId) qs.set("chunk", initialChunkId);
              const tail = qs.toString();
              return `/rag/viewer/${docId}${tail ? `?${tail}` : ""}`;
            })()}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
            title="Open in full document viewer"
          >
            <ExternalLink className="h-3 w-3" />
            Full viewer
          </Link>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {/* The legacy 4-pane DocumentViewer hits /api/document/* which has
            its own bugs (returns 404 for many docs). We render the
            LibraryPreviewPage in embedded mode here — same data, working
            endpoints, gives the user real pages + raw + cleaned text +
            chunks + per-doc lexical search.

            The old DocumentViewer import is kept so the codebase still
            type-checks if anything else references it; this surface
            no longer renders it. */}
        <LibraryPreviewPage documentId={docId} embedded />
        {false && (
          <DocumentViewer
            documentId={docId}
            initialPage={initialPage}
            initialChunkId={initialChunkId}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// "Not ingested yet" CTA — primary action is the streaming reprocess.
// ---------------------------------------------------------------------------

function NotIngestedCard({
  fileName,
  ingest,
  className,
}: {
  fileName: string | null;
  ingest: UseFileIngestState & {
    run: (opts?: { force?: boolean }) => Promise<void>;
    runOnce: (opts?: { force?: boolean }) => Promise<void>;
    cancel: () => void;
    reset: () => void;
  };
  className?: string;
}) {
  const subtitle =
    ingest.status === "error"
      ? `Ingest failed: ${ingest.error}`
      : ingest.status === "complete"
        ? "Done — refreshing…"
        : "Run the RAG pipeline (extract → clean → chunk → embed) so this file can be searched, cited, and added to data stores.";

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-4 p-8 text-center",
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Rainbow className="h-6 w-6 text-primary" />
      </div>
      <div className="space-y-1 max-w-md">
        <h3 className="text-sm font-semibold">
          {fileName
            ? `${fileName} hasn't been processed for RAG yet`
            : "This file hasn't been processed for RAG yet"}
        </h3>
        <p className="text-xs text-muted-foreground break-words">{subtitle}</p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void ingest.run()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Rainbow className="h-3.5 w-3.5" />
          Process for RAG
        </button>
        {ingest.status === "error" && (
          <button
            type="button"
            onClick={ingest.reset}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// "Lookup unavailable" — endpoint not implemented yet, or transient.
// ---------------------------------------------------------------------------

function UnavailableCard({
  reason,
  onRetry,
  className,
}: {
  reason: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center",
        className,
      )}
      role="alert"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
        <AlertCircle className="h-6 w-6 text-amber-500" />
      </div>
      <div className="space-y-1 max-w-md">
        <h3 className="text-sm font-semibold">
          Document lookup is unavailable
        </h3>
        <p className="text-xs text-muted-foreground break-words">{reason}</p>
        <p className="text-[10px] text-muted-foreground/70">
          Couldn't read the document index. Likely a transient network
          hiccup — try again.
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
      >
        Retry
      </button>
    </div>
  );
}
