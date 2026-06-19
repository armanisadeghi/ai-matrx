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
  const {
    enabled,
    binding,
    saving,
    setEnabled,
    bindToNote,
    unbind,
    openAsWindow,
  } = useWorkingDocument(conversationId);

  const isNoteBound = binding.kind === "note" && !!binding.id;
  // The default chat backing is a durable `cx_working_documents` row — agent
  // edits persist there and round-trip back. Treat it as "saved", not "unbound".
  const isCxBacked = binding.kind === "cx_working_document" && !!binding.id;

  return (
    <div className="flex h-full flex-col">
      {/* Single control row — toggle, binding, bind/change, open-as-window */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1.5">
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          aria-label="Toggle working document"
        />

        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1",
            !enabled && "pointer-events-none opacity-50",
          )}
        >
          <Link2
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              isNoteBound ? "text-primary" : "text-muted-foreground",
            )}
          />
          <span className="truncate text-xs text-muted-foreground">
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
              aria-label="Unbind note (revert to default working document)"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <NotePickerPopover
          onSelectNote={(noteId) => bindToNote(noteId)}
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

      {/* Editor — gets all remaining space (panel header suppressed) */}
      <div className="min-h-0 flex-1">
        <WorkingDocumentPanel
          conversationId={conversationId}
          showHeader={false}
          className="bg-transparent"
        />
      </div>
    </div>
  );
}
