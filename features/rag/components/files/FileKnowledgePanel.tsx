"use client";

/**
 * FileKnowledgePanel — THE knowledge/NER status + trigger widget for a file.
 *
 * One canonical implementation, mounted wherever a surface needs to show
 * "is this file in the knowledge index?" and let the user (re)run the
 * RAG + NER pipeline: the Analysis tab, the Analysis Studio rail, and any
 * future surface. Composes the existing canonical primitives only:
 * `useFileDocument` (status), `ingestFile` (trigger — chunks + embeddings
 * + the 5-stage NER pass server-side), and the Knowledge tab / KG routes.
 */

import { useState } from "react";
import {
  Brain,
  Database,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFileDocument } from "@/features/files/hooks/useFileDocument";
import { ingestFile } from "@/features/rag/api/ingest";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import { clearFileDocumentCache } from "@/features/files/api/document-lookup";

export interface FileKnowledgePanelProps {
  fileId: string;
  className?: string;
  /** Compact = single row chrome for rails/sidebars. */
  compact?: boolean;
}

export function FileKnowledgePanel({
  fileId,
  className,
  compact = false,
}: FileKnowledgePanelProps) {
  const { state, refresh } = useFileDocument(fileId);
  const [running, setRunning] = useState(false);

  async function runIngest(force: boolean) {
    if (running) return;
    setRunning(true);
    try {
      const result = await ingestFile(fileId, { force });
      if (result.error) {
        toast.error(`Knowledge indexing failed: ${result.error}`);
      } else {
        toast.success(
          `Indexed: ${result.chunks_written} ${RAG_VOCAB.segmentsShort.toLowerCase()}, ${result.embeddings_written} embeddings — NER runs automatically.`,
        );
        clearFileDocumentCache(fileId);
        refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Knowledge indexing failed");
    } finally {
      setRunning(false);
    }
  }

  const body = (() => {
    if (state.status === "idle" || state.status === "loading") {
      return (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Checking knowledge index…
        </div>
      );
    }
    if (state.status === "unavailable") {
      return (
        <p className="text-[11px] text-muted-foreground">
          Knowledge status unavailable: {state.reason}
        </p>
      );
    }
    if (state.status === "absent") {
      return (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground">
            Not in the knowledge index yet. Indexing extracts the text, segments
            it, embeds it, and runs entity recognition (NER) so agents and
            search can use this document.
          </p>
          <Button
            size="sm"
            className="h-7 text-[11px]"
            disabled={running}
            onClick={() => void runIngest(false)}
          >
            {running ? (
              <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
            ) : (
              <Brain className="h-3 w-3 mr-1.5" />
            )}
            Index for knowledge (runs NER)
          </Button>
        </div>
      );
    }
    // found
    const doc = state.doc;
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-700 dark:text-emerald-300">
            Indexed
          </span>
          <span className="rounded bg-muted px-1.5 py-0.5 tabular-nums">
            {doc.chunk_count} {RAG_VOCAB.segmentsShort.toLowerCase()}
          </span>
          {doc.has_clean_content ? (
            <span className="rounded bg-muted px-1.5 py-0.5">cleaned</span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            disabled={running}
            onClick={() => void runIngest(true)}
          >
            {running ? (
              <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1.5" />
            )}
            Re-run indexing + NER
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            onClick={() =>
              window.open("/knowledge-graph", "_blank", "noopener,noreferrer")
            }
          >
            <ExternalLink className="h-3 w-3 mr-1.5" />
            Knowledge graph
          </Button>
        </div>
      </div>
    );
  })();

  return (
    <div
      className={cn(
        "rounded border border-border bg-card/40",
        compact ? "p-2" : "p-2.5",
        className,
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Database className="h-3 w-3" /> Knowledge index (RAG + NER)
      </div>
      {body}
    </div>
  );
}
