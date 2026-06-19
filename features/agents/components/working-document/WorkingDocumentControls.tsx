"use client";

/**
 * WorkingDocumentControls — the Smart Input "Document" tab body.
 *
 * Name field, enable/disable toggle, note binding (pick / change / unbind),
 * open-as-window, and an embedded editor. All driven by
 * `useWorkingDocument(conversationId)`.
 *
 * Binding a note while content already exists prompts the user to either
 * append the current document to the note or replace it — we never silently
 * discard their work. Unbinding reverts to the conversation's own document.
 */

import { useState } from "react";
import { Link2, Maximize2, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { NotePickerPopover } from "@/features/notes/components/NotePickerPopover";
import { useWorkingDocument } from "@/features/agents/hooks/useWorkingDocument";
import { WorkingDocumentPanel } from "./WorkingDocumentPanel";

interface WorkingDocumentControlsProps {
  conversationId: string;
}

export function WorkingDocumentControls({
  conversationId,
}: WorkingDocumentControlsProps) {
  const {
    enabled,
    content,
    title,
    binding,
    saving,
    setEnabled,
    bindToNote,
    unbind,
    setTitle,
    openAsWindow,
  } = useWorkingDocument(conversationId);

  // Note id awaiting a merge decision (set when the user picks a note while the
  // document already has content). Null = no pending decision.
  const [pendingNoteId, setPendingNoteId] = useState<string | null>(null);

  const isNoteBound = binding.kind === "note" && !!binding.id;
  // The default chat backing is a durable `cx_working_documents` row — agent
  // edits persist there and round-trip back. Treat it as "saved", not "unbound".
  const isCxBacked = binding.kind === "cx_working_document" && !!binding.id;

  const handleSelectNote = (noteId: string) => {
    // No existing content → adopt the note directly, nothing to lose.
    if (!content.trim()) {
      bindToNote(noteId, "replace");
      return;
    }
    // Existing content → ask before discarding it.
    setPendingNoteId(noteId);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Name + toggle + open-as-window */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1.5">
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          aria-label="Toggle working document"
        />
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={!enabled || isNoteBound}
          placeholder="Name this document…"
          aria-label="Document name"
          className={cn(
            "min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm font-medium text-foreground",
            "placeholder:font-normal placeholder:text-muted-foreground",
            "hover:border-border focus:border-border focus:outline-none focus:ring-1 focus:ring-ring",
            "disabled:opacity-60",
          )}
        />
        <button
          type="button"
          onClick={openAsWindow}
          disabled={!enabled}
          aria-label="Open as window"
          title="Open as window"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      {/* Binding row — source status + bind/change/unbind */}
      <div
        className={cn(
          "flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5",
          !enabled && "pointer-events-none opacity-50",
        )}
      >
        <Link2
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            isNoteBound ? "text-primary" : "text-muted-foreground",
          )}
        />
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {isNoteBound
            ? binding.label || "Bound note"
            : isCxBacked
              ? saving
                ? "Saving…"
                : "Auto-saved"
              : "Preparing…"}
        </span>
        {isNoteBound && (
          <button
            type="button"
            onClick={unbind}
            aria-label="Unbind note (revert to this conversation's document)"
            title="Unbind note"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <NotePickerPopover
          onSelectNote={handleSelectNote}
          align="end"
          trigger={
            <button
              type="button"
              disabled={!enabled}
              className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              {isNoteBound ? "Change" : "Bind note"}
            </button>
          }
        />
      </div>

      {/* Editor — gets all remaining space (panel header suppressed) */}
      <div className="min-h-0 flex-1">
        <WorkingDocumentPanel
          conversationId={conversationId}
          showHeader={false}
          className="bg-transparent"
        />
      </div>

      {/* Merge decision — append current document to the note, or replace it. */}
      <AlertDialog
        open={!!pendingNoteId}
        onOpenChange={(open) => {
          if (!open) setPendingNoteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Keep your current document?</AlertDialogTitle>
            <AlertDialogDescription>
              You already have content in this working document. Append it below
              the note&apos;s content, or replace it with the note.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => setPendingNoteId(null)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (pendingNoteId) bindToNote(pendingNoteId, "replace");
                setPendingNoteId(null);
              }}
            >
              Replace
            </Button>
            <Button
              onClick={() => {
                if (pendingNoteId) bindToNote(pendingNoteId, "append");
                setPendingNoteId(null);
              }}
            >
              Append below
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
