"use client";

/**
 * WorkingDocumentPanel — the reusable working-document editor surface.
 *
 * Attaches to any conversation with a single `conversationId` prop. Renders the
 * shared, collaborative document: the agent edits it each round (via ctx_patch
 * → instanceContext), the user edits it here, and both stay in sync. Used
 * standalone, inside the floating window (`WorkingDocumentWindow`), and embedded
 * in the Smart Input "Document" tab.
 */

import { useState, useEffect } from "react";
import { Check, Copy, FileText, Link2, Loader2, Maximize2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useWorkingDocument } from "@/features/agents/hooks/useWorkingDocument";
import type { WorkingDocumentKind } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.slice";
import { WorkingDocumentEditor } from "./WorkingDocumentEditor";
import { WorkingDocumentViewControls } from "./WorkingDocumentViewControls";
import { WorkingDocumentVersionHistory } from "./WorkingDocumentVersionHistory";
import { DiffViewer } from "@/components/diff/DiffViewer";
import { useWorkingDocChanges } from "@/features/transcript-studio/hooks/useWorkingDocChanges";
import {
  patchWorkingDocViewState,
  setWorkingDocHistoryOpen,
  setWorkingDocMainView,
  useWorkingDocViewState,
} from "./workingDocumentViewStore";

interface WorkingDocumentPanelProps {
  conversationId: string;
  kind?: WorkingDocumentKind;
  className?: string;
  showOpenInWindow?: boolean;
  showEnableToggle?: boolean;
  showHeader?: boolean;
}

export function WorkingDocumentPanel({
  conversationId,
  kind = "working",
  className,
  showOpenInWindow = true,
  showEnableToggle = true,
  showHeader = true,
}: WorkingDocumentPanelProps) {
  const {
    enabled,
    title,
    binding,
    saving,
    error,
    draft,
    content,
    onChange,
    flush,
    setEnabled,
    openAsWindow,
  } = useWorkingDocument(conversationId, kind);

  const { before, after, hasUnseenChange, markSeen } = useWorkingDocChanges(
    content,
    draft,
  );
  const { mainView, historyOpen } = useWorkingDocViewState(conversationId);

  const isScratch = kind === "scratch";
  const docNoun = isScratch ? "scratchpad" : "working document";
  const docTitleFallback = isScratch ? "Scratchpad" : "Working document";
  const [hasCopied, setHasCopied] = useState(false);

  useEffect(() => {
    patchWorkingDocViewState(conversationId, { hasUnseenChange, saving });
  }, [conversationId, hasUnseenChange, saving]);

  useEffect(() => {
    if (mainView === "agent-diff") markSeen();
  }, [mainView, markSeen]);

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
      {showHeader && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-foreground">
              {title || docTitleFallback}
            </span>
            <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
              {isScratch ? (
                "Private to you — the agent can read it, but never edits it"
              ) : isBound ? (
                <>
                  <Link2 className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    Synced to note{binding.label ? ` · ${binding.label}` : ""}
                  </span>
                </>
              ) : (
                "Auto-saved to this conversation"
              )}
            </span>
          </div>

          {enabled && kind === "working" && (
            <WorkingDocumentViewControls conversationId={conversationId} />
          )}

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
      )}

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
          <div className="min-h-0 flex-1">
            {kind === "working" && mainView === "agent-diff" ? (
              <DiffViewer
                original={before}
                modified={after}
                engine="light"
                language="markdown"
                originalLabel="Before"
                modifiedLabel="After (agent's edit)"
                defaultView="highlight"
                showToolbar
                className="h-full min-h-0"
              />
            ) : (
              <WorkingDocumentEditor
                conversationId={conversationId}
                draft={draft}
                onChange={onChange}
                onFlush={flush}
                placeholder={
                  isScratch
                    ? "Your private scratchpad. Jot notes, links, or context here — the agent can read it to understand what you're thinking, but it never edits it."
                    : undefined
                }
              />
            )}
          </div>
          {kind === "working" && (
            <WorkingDocumentVersionHistory
              conversationId={conversationId}
              currentContent={draft}
              open={historyOpen}
              onOpenChange={(open) =>
                setWorkingDocHistoryOpen(conversationId, open)
              }
              onApplySnapshot={(snapshotContent) => {
                onChange(snapshotContent);
                flush();
                setWorkingDocHistoryOpen(conversationId, false);
                setWorkingDocMainView(conversationId, "editor");
              }}
            />
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/40" />
          <p className="max-w-xs text-sm text-muted-foreground">
            {isScratch
              ? "The scratchpad is off. Turn it on for a private space the agent can read but never edits."
              : "The working document is off. Turn it on to collaborate with the agent on a shared, living document."}
          </p>
          <button
            type="button"
            onClick={() => setEnabled(true)}
            className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Enable {docNoun}
          </button>
        </div>
      )}
    </div>
  );
}
