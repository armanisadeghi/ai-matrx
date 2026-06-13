// features/notes/components/NoteToolbar.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, RefreshCw, Copy, Share2, Save } from "lucide-react";
import { Button } from "@/components/ui/ButtonMine";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MicrophoneIconButton } from "@/features/audio/components/MicrophoneIconButton";
import { ProcessForRagButton } from "@/features/rag/components/ProcessForRagButton";
import { useNoteIngestStatus } from "@/features/notes/hooks/useNoteIngestStatus";
import type { Note } from "../types";
import { cn } from "@/lib/utils";

interface NoteToolbarProps {
  activeNote: Note | null;
  onCreateNote: () => void;
  onDeleteNote: (noteId: string) => void;
  onCopyNote?: (noteId: string) => void;
  onShareNote?: (noteId: string) => void;
  onSave?: () => void;
  onRefresh: () => void;
  onTranscriptionComplete?: (text: string) => void;
  className?: string;
}

export function NoteToolbar({
  activeNote,
  onCreateNote,
  onDeleteNote,
  onCopyNote,
  onShareNote,
  onSave,
  onRefresh,
  onTranscriptionComplete,
  className,
}: NoteToolbarProps) {
  const router = useRouter();
  const ingest = useNoteIngestStatus(activeNote?.id ?? null);
  return (
    <div
      className={cn(
        "flex items-center gap-1 px-2 py-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-textured",
        className,
      )}
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 p-0"
              onClick={() => onCreateNote()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>New</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {activeNote && onSave && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 p-0"
                onClick={onSave}
              >
                <Save className="h-4 w-4 text-green-600 dark:text-green-500" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Save</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {activeNote && onCopyNote && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 p-0"
                onClick={() => onCopyNote(activeNote.id)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Duplicate</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {activeNote && onShareNote && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 p-0"
                onClick={() => onShareNote(activeNote.id)}
              >
                <Share2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Share</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {activeNote && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 p-0"
                onClick={() => onDeleteNote(activeNote.id)}
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 p-0"
              onClick={onRefresh}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh All</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {activeNote && onTranscriptionComplete && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <MicrophoneIconButton
                  onTranscriptionComplete={onTranscriptionComplete}
                  variant="icon-only"
                  size="sm"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>Voice input</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {activeNote && (
        <div className="ml-1 flex items-center gap-1.5">
          <ProcessForRagButton
            sourceKind="note"
            sourceId={activeNote.id}
            idleLabel="Run NER now"
            completeLabel="Indexed"
            force
            onComplete={() => {
              // ProcessForRagButton only clears the file-lookup cache for
              // cld_file; for notes we fire the cross-component event so the
              // "In knowledge base" dot below (and any other note surface)
              // re-probes immediately.
              window.dispatchEvent(
                new CustomEvent("cloud-files:document-processed", {
                  detail: { fileId: activeNote.id },
                }),
              );
              toast.success("Note indexed for RAG", {
                action: {
                  label: "View in library",
                  onClick: () => router.push("/rag/library"),
                },
              });
            }}
          />
          {ingest.state === "ingested" && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
              title="This note is in the knowledge base"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="hidden sm:inline">In knowledge base</span>
            </span>
          )}
        </div>
      )}

      <div className="ml-auto flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        {activeNote && (
          <span>
            {new Date(activeNote.updated_at).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>
    </div>
  );
}
