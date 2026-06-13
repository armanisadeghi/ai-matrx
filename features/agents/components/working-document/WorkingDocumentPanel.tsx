"use client";

/**
 * WorkingDocumentPanel — the reusable working-document editor surface.
 *
 * Attaches to any conversation with a single `conversationId` prop. Renders the
 * shared, collaborative document: the agent edits it each round (via ctx_patch
 * → instanceContext), the user edits it here, and both stay in sync. Used
 * standalone, inside the floating window (`WorkingDocumentWindow`), and embedded
 * in the Smart Input "Document" tab.
 *
 * Modeled on Scribe's `WorkingDocumentHeader` / `FocusedDocumentEditor`, but
 * conversation-keyed and source-agnostic (ephemeral, or bound to a note).
 */

import { useState } from "react";
import { Check, Copy, FileText, Link2, Loader2, Maximize2 } from "lucide-react";
import { toast } from "sonner";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useWorkingDocument } from "@/features/agents/hooks/useWorkingDocument";

interface WorkingDocumentPanelProps {
  conversationId: string;
  className?: string;
  /** Show the "Open as window" button in the header. Default true. */
  showOpenInWindow?: boolean;
  /** Show the enable/disable switch in the header. Default true. */
  showEnableToggle?: boolean;
}

export function WorkingDocumentPanel({
  conversationId,
  className,
  showOpenInWindow = true,
  showEnableToggle = true,
}: WorkingDocumentPanelProps) {
  const {
    enabled,
    title,
    binding,
    saving,
    error,
    draft,
    onChange,
    flush,
    setEnabled,
    openAsWindow,
  } = useWorkingDocument(conversationId);

  const [hasCopied, setHasCopied] = useState(false);

  const handleCopy = async () => {
    const text = draft.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(draft);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 600);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const isBound = binding.kind === "note" && !!binding.id;

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-card", className)}>
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-foreground">
            {title || "Working document"}
          </span>
          <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
            {isBound ? (
              <>
                <Link2 className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  Synced to note{binding.label ? ` · ${binding.label}` : ""}
                </span>
              </>
            ) : (
              "Not saved — bind a note to keep it"
            )}
          </span>
        </div>

        {enabled && (
          <>
            <button
              type="button"
              onClick={() => void handleCopy()}
              disabled={!draft.trim()}
              aria-label={hasCopied ? "Copied" : "Copy document"}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                draft.trim()
                  ? hasCopied
                    ? "text-green-500 hover:bg-accent"
                    : "text-foreground hover:bg-accent"
                  : "text-muted-foreground/40",
              )}
            >
              {hasCopied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
            {showOpenInWindow && (
              <button
                type="button"
                onClick={openAsWindow}
                aria-label="Open as window"
                title="Open as window"
                className="flex h-8 w-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            )}
          </>
        )}

        {showEnableToggle && (
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-label="Toggle working document"
          />
        )}
      </div>

      {/* Body */}
      {enabled ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {saving && (
            <div className="flex shrink-0 items-center justify-end gap-1 px-3 pt-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving
            </div>
          )}
          {error && (
            <div className="shrink-0 px-3 pt-1 text-[11px] text-destructive">
              {error}
            </div>
          )}
          <ProTextarea
            value={draft}
            onChange={(e) => onChange(e.target.value)}
            onBlur={flush}
            placeholder="Empty. Ask the agent to draft or rework this document — or type here. Your edits and the agent's stay in sync each round."
            wrapperClassName="flex min-h-0 flex-1 flex-col p-3"
            className="h-full min-h-0 flex-1 resize-none border-0 bg-transparent text-base leading-relaxed text-foreground shadow-none focus-visible:ring-0"
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/40" />
          <p className="max-w-xs text-sm text-muted-foreground">
            The working document is off. Turn it on to collaborate with the
            agent on a shared, living document.
          </p>
          <button
            type="button"
            onClick={() => setEnabled(true)}
            className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Enable working document
          </button>
        </div>
      )}
    </div>
  );
}
