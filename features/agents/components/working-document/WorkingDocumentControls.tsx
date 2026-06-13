"use client";

/**
 * WorkingDocumentControls — the Smart Input "Document" tab body.
 *
 * Enable/disable toggle, note binding (pick / change / unbind), open-as-window,
 * and an embedded editor. All driven by `useWorkingDocument(conversationId)`.
 */

import { Link2, Maximize2, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { NotePickerPopover } from "@/features/notes/components/NotePickerPopover";
import { useWorkingDocument } from "@/features/agents/hooks/useWorkingDocument";
import { WorkingDocumentPanel } from "./WorkingDocumentPanel";

interface WorkingDocumentControlsProps {
  conversationId: string;
}

export function WorkingDocumentControls({
  conversationId,
}: WorkingDocumentControlsProps) {
  const { enabled, binding, setEnabled, bindToNote, unbind, openAsWindow } =
    useWorkingDocument(conversationId);

  const isBound = binding.kind === "note" && !!binding.id;

  return (
    <div className="flex h-full flex-col">
      {/* Settings */}
      <div className="shrink-0 space-y-2 border-b border-border px-3 py-2.5">
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-muted/40">
          <span className="flex flex-col">
            <span className="text-sm font-medium text-foreground">
              Working document
            </span>
            <span className="text-xs text-muted-foreground">
              A shared, living document the agent edits each round
            </span>
          </span>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </label>

        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border border-border px-3 py-2",
            !enabled && "pointer-events-none opacity-50",
          )}
        >
          <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-foreground">
              {isBound ? binding.label || "Bound note" : "No bound source"}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {isBound
                ? "Edits sync to this note (debounced)"
                : "Bind a note to keep the document"}
            </span>
          </div>
          {isBound && (
            <button
              type="button"
              onClick={unbind}
              aria-label="Unbind note"
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <NotePickerPopover
            onSelectNote={(noteId) => bindToNote(noteId)}
            align="end"
            trigger={
              <button
                type="button"
                className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                {isBound ? "Change" : "Bind note"}
              </button>
            }
          />
        </div>

        {enabled && (
          <button
            type="button"
            onClick={openAsWindow}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <Maximize2 className="h-4 w-4" />
            Open as window
          </button>
        )}
      </div>

      {/* Embedded editor */}
      <div className="min-h-0 flex-1">
        <WorkingDocumentPanel
          conversationId={conversationId}
          showEnableToggle={false}
          showOpenInWindow={false}
          className="bg-transparent"
        />
      </div>
    </div>
  );
}
