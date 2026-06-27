"use client";

// NoteKnowledgePanel — a note's RAG / knowledge-base surface, mirroring the
// file "Document" tab (DocumentTab): index it, see its status, re-index, and —
// once indexed — engage with it via the canonical RAG document viewer
// (LibraryPreviewPage embedded: chunks, raw/cleaned text, and in-document
// search that highlights matches + summarizes which pages they're on). Hosted
// in a pop-out SidePanelSurface via the `noteKnowledgePanel` overlay.

import { Database, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ProcessForRagButton } from "@/features/rag/components/ProcessForRagButton";
import { LibraryPreviewPage } from "@/features/rag/components/library/LibraryPreviewPage";
import { useNoteIngestStatus } from "../hooks/useNoteIngestStatus";

/** Light up `useNoteIngestStatus` everywhere instantly. ProcessForRagButton
 *  only clears the cld_file cache; for notes the panel fires the
 *  cross-component event itself. */
function announceProcessed(noteId: string) {
  window.dispatchEvent(
    new CustomEvent("cloud-files:document-processed", {
      detail: { fileId: noteId },
    }),
  );
}

export function NoteKnowledgePanel({ noteId }: { noteId: string }) {
  const { state, documentId, refresh } = useNoteIngestStatus(noteId);

  if (state === "loading") {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking knowledge base…
      </div>
    );
  }

  if (state !== "ingested" || !documentId) {
    return (
      <div className="flex h-full flex-col items-start gap-3 p-5">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Database className="h-4 w-4 text-primary" /> Not in the knowledge base
          yet
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Indexing extracts this note&apos;s text, splits it into segments,
          embeds them, and runs entity recognition (NER) — so agents and search
          can retrieve it. You&apos;ll then be able to test what it returns right
          here.
        </p>
        <ProcessForRagButton
          sourceKind="note"
          sourceId={noteId}
          idleLabel="Add to knowledge base"
          completeLabel="Indexed"
          onComplete={() => {
            announceProcessed(noteId);
            toast.success("Note added to the knowledge base");
            refresh();
          }}
        />
      </div>
    );
  }

  // Indexed — header chrome + the canonical RAG viewer (chunks + in-document
  // search with highlighting).
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[0.6875rem] font-medium text-emerald-700 dark:text-emerald-300">
          In knowledge base
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <ProcessForRagButton
            sourceKind="note"
            sourceId={noteId}
            idleLabel="Re-index"
            completeLabel="Re-indexed"
            force
            onComplete={() => {
              announceProcessed(noteId);
              refresh();
            }}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() =>
              window.open(
                `/rag/viewer/${documentId}`,
                "_blank",
                "noopener,noreferrer",
              )
            }
          >
            <ExternalLink className="h-3.5 w-3.5" /> Full viewer
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <LibraryPreviewPage documentId={documentId} embedded />
      </div>
    </div>
  );
}
