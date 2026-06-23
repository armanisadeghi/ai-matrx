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

import { useEffect } from "react";
import { FileText, Link2, Loader2, Maximize2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useWorkingDocument } from "@/features/agents/hooks/useWorkingDocument";
import type { WorkingDocumentKind } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.slice";
import { RichDocumentActionProvider } from "@/features/rich-document/RichDocumentActionProvider";
import { RichDocumentActionSurface } from "@/features/rich-document/RichDocumentActionSurface";
import type { ContentSource } from "@/features/rich-document/types";
import { WorkingDocumentEditor } from "./WorkingDocumentEditor";
import {
  sourceFeatureForKind,
  type WorkingDocumentSurfaceContext,
} from "./workingDocumentSurface";
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

/**
 * Stable RichDocument action-surface id for a conversation's document. Shared
 * by the panel (which mounts the headless provider + renders the header bar)
 * and any other view of the same document (the Smart Input "Document" tab)
 * that wants to render the toolbar via `<RichDocumentActionSurface/>`.
 */
export function workingDocumentSurfaceId(
  conversationId: string,
  kind: WorkingDocumentKind = "working",
): string {
  return `working-document-${conversationId}-${kind}`;
}

interface WorkingDocumentPanelProps {
  conversationId: string;
  kind?: WorkingDocumentKind;
  className?: string;
  showOpenInWindow?: boolean;
  showEnableToggle?: boolean;
  showHeader?: boolean;
  /**
   * Host page context carried into the document SURFACE — the conversation's
   * context + scope selections — so agents launched from the highlight→agent
   * menu see what the chat agent sees. The host (chat, war-room, the window)
   * supplies it; defaults to deriving from `conversationId`.
   */
  surfaceContext?: WorkingDocumentSurfaceContext;
}

export function WorkingDocumentPanel({
  conversationId,
  kind = "working",
  className,
  showOpenInWindow = true,
  showEnableToggle = true,
  showHeader = true,
  surfaceContext,
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

  useEffect(() => {
    patchWorkingDocViewState(conversationId, { hasUnseenChange, saving });
  }, [conversationId, hasUnseenChange, saving]);

  useEffect(() => {
    if (mainView === "agent-diff") markSeen();
  }, [mainView, markSeen]);

  const isBound = binding.kind === "note" && !!binding.id;

  // The working document's RichDocument identity. Drives the full action
  // toolkit (copy / read-aloud / save-to-notes/task / HTML page / email /
  // print / edit) — parity with an assistant response and a note — wherever
  // this panel renders. `documentId` is the durable backing row (when bound to
  // one) so save-to-task links a parent. The actions live in a REMOTE surface:
  // a headless provider (mounted below) registers the live draft + source, and
  // the header bar renders it — so the toolbar is present in every editor mode,
  // not just preview.
  const wdSurfaceId = workingDocumentSurfaceId(conversationId, kind);
  const wdSource: ContentSource = {
    type: "working-document",
    conversationId,
    kind,
    documentId: binding.kind === "cx_working_document" ? binding.id : null,
  };

  // Surface context handed to the highlight→agent menu. Host-supplied wins;
  // otherwise a minimal one keyed on the conversation (the scope hook derives
  // the conversation's context from Redux).
  const resolvedSurfaceContext: WorkingDocumentSurfaceContext = surfaceContext ?? {
    conversationId,
    sourceFeature: sourceFeatureForKind(kind),
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-card", className)}>
      {/* Headless action provider — registers the full RichDocument toolkit for
          this document's surface from the LIVE draft, without re-rendering the
          content engine. The header bar (and the body's right-click menu)
          consume it. Mounted only while enabled so a disabled doc registers
          nothing. */}
      {enabled && (
        <RichDocumentActionProvider
          content={draft}
          source={wdSource}
          surfaceId={wdSurfaceId}
        />
      )}
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
              {/* Full action toolkit — read aloud, save to notes/task, HTML
                  page, email, print, edit, and more — same set an assistant
                  response and a note expose. Renders the live draft via the
                  headless provider above. */}
              <RichDocumentActionSurface
                surfaceId={wdSurfaceId}
                variant="bar"
                fallback={null}
              />
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
                kind={kind}
                draft={draft}
                onChange={onChange}
                onFlush={flush}
                actionsSource={wdSource}
                surfaceContext={resolvedSurfaceContext}
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
