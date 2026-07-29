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

import { useEffect, useState } from "react";
import { FileText, Link2, Loader2, Lock, Maximize2, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NotePickerPopover } from "@/features/notes/components/NotePickerPopover";
import { useWorkingDocument } from "@/features/agents/hooks/useWorkingDocument";
import { DocumentLinkPicker } from "./DocumentLinkPicker";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  scratchDocIdFromScope,
  type WorkingDocumentKind,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.slice";
import {
  selectActiveScratchpadId,
  selectAttachedScratchpadIds,
  selectWorkingDocEnabled,
  selectWorkingDocMaterialized,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { useAccess } from "@/utils/permissions/access";
import {
  attachScratchpadToConversationThunk,
  detachScratchpadFromConversationThunk,
  setScratchpadGateThunk,
} from "@/features/agents/redux/execution-system/instance-working-document/scratchpad.thunks";
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
import { useLiveWorkingDocPatch } from "@/features/agents/redux/execution-system/instance-working-document/useLiveWorkingDocPatch";
import { WorkingDocumentAgentDiff } from "./WorkingDocumentAgentDiff";
import { WorkingDocumentLatestVersionDiff } from "./WorkingDocumentLatestVersionDiff";
import {
  patchWorkingDocViewState,
  setWorkingDocHistoryOpen,
  setWorkingDocMainView,
  setWorkingDocSeenPatch,
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
   * Show the title + subtitle in the header. Off when an outer chrome (e.g. the
   * DocumentsWorkspace tab strip) already names the document — keeps the action
   * toolbar but drops the redundant title to avoid nested duplicate headings.
   */
  showHeaderTitle?: boolean;
  /**
   * Show the compact source-controls row (rename, bind note, link existing,
   * saved-status) under the header. On by default so EVERY mount — canvas,
   * window, sidebar, sheet, run-controls tab — gets rename/bind/link; gate it
   * off only in containers too tight to fit it.
   */
  showSourceControls?: boolean;
  /**
   * Host page context carried into the document SURFACE — the conversation's
   * context + scope selections — so agents launched from the highlight→agent
   * menu see what the chat agent sees. The host (chat, war-room, the window)
   * supplies it; defaults to deriving from `conversationId`.
   */
  surfaceContext?: WorkingDocumentSurfaceContext;
  /**
   * SCRATCH ONLY: the CHAT conversation this panel should offer a per-document
   * "Share with this chat" toggle for. Scratch panels mount at the sp:<docId>
   * scope (no chat of their own), so the host that knows the chat — the
   * workspace, the canvas payload — threads it in. Absent = no share toggle
   * (e.g. the global quick panel, which has no chat context).
   */
  gateConversationId?: string;
}

export function WorkingDocumentPanel({
  conversationId,
  kind = "working",
  className,
  showOpenInWindow = true,
  showEnableToggle = true,
  showHeader = true,
  showHeaderTitle = true,
  showSourceControls = true,
  surfaceContext,
  gateConversationId,
}: WorkingDocumentPanelProps) {
  const dispatch = useAppDispatch();
  const {
    enabled,
    title,
    binding,
    saving,
    error,
    conflict,
    resolveConflict,
    draft,
    content,
    onChange,
    flush,
    setEnabled,
    setTitle,
    bindToNote,
    unbind,
    linkToDocument,
    openInCanvas,
  } = useWorkingDocument(conversationId, kind);

  // Note id awaiting a merge decision (user picked a note while the document
  // already has content). Null = no pending decision.
  const [pendingNoteId, setPendingNoteId] = useState<string | null>(null);

  // The agent's live edit to the working document — the SAME source the inline
  // tool-call message animates. Drives the agent-diff view and the "Agent
  // edited" notification.
  const livePatch = useLiveWorkingDocPatch(conversationId);
  const { mainView, historyOpen, seenPatchCallId } =
    useWorkingDocViewState(conversationId);

  // A patch is "unseen" until the user opens the diff view (or a fresh one lands
  // with a new callId). Acknowledging it clears the notification but NOT the diff.
  const hasUnseenChange =
    livePatch.hasPatch &&
    !!livePatch.latestCallId &&
    livePatch.latestCallId !== seenPatchCallId;

  const isScratch = kind === "scratch";
  const docNoun = isScratch ? "scratchpad" : "working document";
  const docTitleFallback = isScratch ? "Scratchpad" : "Working document";

  // ── Per-document "Share with this chat" (scratch only). The active
  // scratchpad shares via the conversation GATE; any other scratchpad shares
  // via an attach edge. Only offered when the host threaded in the chat id. ──
  const scratchDocId = isScratch ? scratchDocIdFromScope(conversationId) : null;
  const activeScratchId = useAppSelector(selectActiveScratchpadId);
  const scratchGateOn = useAppSelector(
    selectWorkingDocEnabled(gateConversationId ?? "", "scratch"),
  );
  const attachedScratchIds = useAppSelector(
    selectAttachedScratchpadIds(gateConversationId ?? ""),
  );
  const showScratchShare = isScratch && !!gateConversationId && !!scratchDocId;
  const scratchShared =
    showScratchShare &&
    scratchDocId !== null &&
    (scratchDocId === activeScratchId
      ? scratchGateOn
      : attachedScratchIds.includes(scratchDocId));
  const setScratchShared = (share: boolean) => {
    if (!gateConversationId || !scratchDocId) return;
    if (scratchDocId === activeScratchId) {
      void dispatch(
        setScratchpadGateThunk({
          conversationId: gateConversationId,
          enabled: share,
        }),
      );
      return;
    }
    void dispatch(
      share
        ? attachScratchpadToConversationThunk({
            conversationId: gateConversationId,
            documentId: scratchDocId,
          })
        : detachScratchpadFromConversationThunk({
            conversationId: gateConversationId,
            documentId: scratchDocId,
          }),
    );
  };

  useEffect(() => {
    patchWorkingDocViewState(conversationId, { hasUnseenChange, saving });
  }, [conversationId, hasUnseenChange, saving]);

  // Opening the diff view acknowledges the current patch — clears the pill/dot
  // while keeping the diff itself on screen (the old markSeen wiped the diff).
  useEffect(() => {
    if (mainView === "agent-diff" && livePatch.latestCallId) {
      setWorkingDocSeenPatch(conversationId, livePatch.latestCallId);
    }
  }, [mainView, livePatch.latestCallId, conversationId]);

  const isBound = binding.kind === "note" && !!binding.id;
  const materialized = useAppSelector(
    selectWorkingDocMaterialized(conversationId, kind),
  );

  // ── View-vs-edit gate (the canonical access primitive). A viewer-level
  // sharee gets a read-only editor: their UPDATE would be RLS-refused (0 rows)
  // and surface as an unresolvable fake "concurrent edit" conflict loop.
  // Unmaterialized reserved ids resolve `exists:false` → never read-only.
  const docBindingId =
    !isScratch && binding.kind === "cx_working_document" && binding.id
      ? binding.id
      : undefined;
  const docAccess = useAccess(
    docBindingId && materialized ? "working_document" : undefined,
    docBindingId && materialized ? docBindingId : undefined,
  );
  const viewOnly =
    !docAccess.loading &&
    docAccess.exists &&
    docAccess.level === "view" &&
    !docAccess.isOwner;

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
          {showHeaderTitle ? (
            <>
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
            </>
          ) : (
            <div className="min-w-0 flex-1" />
          )}

          {enabled && (
            <WorkingDocumentViewControls
              conversationId={conversationId}
              showDiff={kind === "working"}
            />
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
                  onClick={openInCanvas}
                  aria-label="Open in Canvas"
                  title="Open in Canvas"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              )}
            </>
          )}

          {showEnableToggle && !isScratch && (
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-label="Toggle working document"
            />
          )}
          {showScratchShare && (
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">
                Share
              </span>
              <Switch
                checked={scratchShared}
                onCheckedChange={setScratchShared}
                aria-label="Share this scratchpad with this chat"
              />
            </label>
          )}
        </div>
      )}

      {/* Source controls — rename, bind note (working), link existing, status.
          Part of the panel so EVERY mount gets the full document chrome. */}
      {showSourceControls && enabled && (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1.5">
          {isScratch ? (
            <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Link2
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                isBound ? "text-primary" : "text-muted-foreground",
              )}
            />
          )}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isBound || viewOnly}
            placeholder={
              isScratch ? "Name this scratchpad…" : "Name this document…"
            }
            aria-label={isScratch ? "Scratchpad name" : "Document name"}
            className={cn(
              "min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-xs font-medium text-foreground",
              "placeholder:font-normal placeholder:text-muted-foreground",
              "hover:border-border focus:border-border focus:outline-none focus:ring-1 focus:ring-ring",
              "disabled:opacity-60",
            )}
          />
          <span className="shrink-0 truncate text-[11px] text-muted-foreground">
            {isScratch
              ? saving
                ? "Saving…"
                : "Private — agent reads, never edits"
              : viewOnly
                ? "View only — shared with you"
                : isBound
                  ? binding.label || "Bound note"
                  : saving
                    ? "Saving…"
                    : "Auto-saved"}
          </span>
          {isBound && (
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
          {!isScratch && (
            <>
              {/* Binding a note REPLACES the doc content — meaningless (and
                  RLS-refused) on a view-only shared doc. */}
              {!viewOnly && (
                <NotePickerPopover
                  onSelectNote={(noteId) => {
                    // No existing content → adopt directly, nothing to lose.
                    if (!content.trim()) bindToNote(noteId, "replace");
                    else setPendingNoteId(noteId);
                  }}
                  align="end"
                  trigger={
                    <button
                      type="button"
                      className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
                    >
                      {isBound ? "Change" : "Bind note"}
                    </button>
                  }
                />
              )}
              <DocumentLinkPicker
                kind={kind}
                align="end"
                excludeDocumentId={
                  binding.kind === "cx_working_document" ? binding.id : null
                }
                onSelect={linkToDocument}
                trigger={
                  <button
                    type="button"
                    className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    Link
                  </button>
                }
              />
              {/* Share the durable document row (users / orgs / public / link).
                  Only once the row EXISTS — an unmaterialized reserved id has
                  nothing to grant on. ShareModal resolves ownership itself. */}
              {materialized &&
                binding.kind === "cx_working_document" &&
                !!binding.id && (
                  <ShareButton
                    resourceType="working_document"
                    resourceId={binding.id}
                    resourceName={title || docTitleFallback}
                    variant="ghost"
                    size="sm"
                    showStatus={false}
                  />
                )}
            </>
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
          {conflict && (
            <div className="shrink-0 border-b border-amber-500/40 bg-amber-500/10 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-amber-700 dark:text-amber-300">
                  The agent edited this document while you were typing. Your text
                  is preserved below — choose which version to keep.
                </span>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => resolveConflict("keep-mine")}
                    className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
                  >
                    Keep mine
                  </button>
                  <button
                    type="button"
                    onClick={() => resolveConflict("take-agent")}
                    className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    Use agent&apos;s version
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="min-h-0 flex-1">
            {conflict ? (
              <DiffViewer
                original={conflict.agentContent}
                modified={draft}
                engine="light"
                language="markdown"
                originalLabel="Agent's version"
                modifiedLabel="Your version (kept)"
                defaultView="split"
                showToolbar
                className="h-full min-h-0"
              />
            ) : kind === "working" && mainView === "agent-diff" ? (
              <WorkingDocumentAgentDiff
                livePatch={livePatch}
                fallback={
                  <WorkingDocumentLatestVersionDiff
                    documentId={
                      binding.kind === "cx_working_document" ? binding.id : null
                    }
                    currentContent={content}
                  />
                }
              />
            ) : (
              <WorkingDocumentEditor
                conversationId={conversationId}
                kind={kind}
                draft={draft}
                onChange={onChange}
                onFlush={flush}
                readOnly={viewOnly}
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
          {enabled && (
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
