"use client";

/**
 * ToolCallVisualization (canonical, v2 contract)
 *
 * The single shell for rendering tool calls. **One tool call = one shell.**
 *
 * Always entries-driven: the caller hands over an explicit
 * `ToolLifecycleEntry[]` (typically a single entry — one card per tool
 * invocation, inline, in the order the model emitted it).
 *
 * `requestId` is metadata only — passed through so the floating-window
 * grouping can collect every tool from the same request into one window.
 * It is **never** used to subscribe to "all tools for this request" —
 * doing that produced the legacy "every card shows every tool" bug.
 */

import React, { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Maximize2,
  PanelRightOpen,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { ShimmerText } from "@/components/loaders/ShimmerText";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

import {
  getInlineRenderer,
  getToolDisplayName,
  getToolPhaseLabel,
  getHeaderSubtitle,
  hasCustomRenderer,
  shouldKeepExpandedOnStream,
} from "../registry/registry";
import { prefetchToolRenderer } from "../db-renderer/toolRendererCache";
import { ToolUpdatesOverlay } from "./ToolUpdatesOverlay";

// ─── Public props ─────────────────────────────────────────────────────────────

export interface ToolCallVisualizationProps {
  entries: ToolLifecycleEntry[];
  /**
   * Optional. Metadata only — used by the floating-window button so
   * re-clicks from any tool group in the same request focus the same
   * window. Never used to fetch "all tools for this request".
   */
  requestId?: string;
  /** Optional. Metadata only — passed through for overlay / window grouping. */
  conversationId?: string;
  /** Accepted for caller compatibility; the row always collapses when done. */
  hasContent?: boolean;
  /** Persisted (post-stream) snapshot — some renderers render compactly. */
  isPersisted?: boolean;
  className?: string;
}

// ─── Shell implementation ─────────────────────────────────────────────────────

const ToolCallVisualizationInner: React.FC<{
  entries: ToolLifecycleEntry[];
  /**
   * Optional live request id. When set, the window-panel surface
   * subscribes to live lifecycle entries and stays in sync as new
   * events stream in. Entries-driven callers (persisted snapshots)
   * leave this undefined and pass an `entries` snapshot to the window.
   */
  requestId?: string;
  conversationId?: string;
  hasContent?: boolean;
  isPersisted?: boolean;
  className?: string;
}> = ({
  entries,
  requestId,
  conversationId,
  isPersisted = false,
  className,
}) => {
  // A tool call is a single line by default. Only the rich, opted-in custom
  // renderers (web_search, deep research, …) start expanded so their data
  // streams in; everything else stays one line until clicked.
  // Done / persisted tool calls collapse to a single line — only a LIVE,
  // actively-streaming custom renderer (the most-recent incoming message) opens
  // itself so its data streams in. On reload everything starts collapsed (and a
  // collapsed body never mounts, so queries are never needlessly re-run).
  const keepExpanded =
    !isPersisted &&
    entries.some(
      (e) =>
        (e.status === "started" ||
          e.status === "progress" ||
          e.status === "step" ||
          e.status === "result_preview") &&
        hasCustomRenderer(e.toolName) &&
        shouldKeepExpandedOnStream(e.toolName),
    );
  // React Compiler memoizes these derivations — no manual useMemo/useCallback.
  const [isExpanded, setIsExpanded] = useState<boolean>(keepExpanded);
  const [isOverlayOpen, setIsOverlayOpen] = useState<boolean>(false);
  const [initialOverlayTab, setInitialOverlayTab] = useState<
    string | undefined
  >(undefined);
  const dispatch = useAppDispatch();

  // Prefetch any DB-stored renderers for tools in this group so they're
  // fetched + compiled before the card expands.
  useEffect(() => {
    for (const e of entries) {
      if (e.toolName) prefetchToolRenderer(e.toolName);
    }
  }, [entries]);

  const anyActive = entries.some(
    (e) =>
      e.status === "started" || e.status === "progress" || e.status === "step",
  );
  const allTerminal =
    entries.length > 0 &&
    entries.every((e) => e.status === "completed" || e.status === "error");
  const phase: "starting" | "processing" | "complete" | "error" =
    entries.length === 0
      ? "starting"
      : anyActive || !allTerminal
        ? "processing"
        : entries.some((e) => e.status === "error")
          ? "error"
          : "complete";

  const headerTool = entries[0] ?? null;

  const toolDisplayName =
    entries.length > 1
      ? `${entries.length} Tools`
      : !headerTool
        ? getToolDisplayName(null)
        : headerTool.displayName &&
            headerTool.displayName !== headerTool.toolName
          ? headerTool.displayName
          : getToolDisplayName(headerTool.toolName);

  const headerSubtitle = ((): string | null => {
    if (!headerTool) return null;
    // Prefer the renderer's DECLARED subtitle (a friendly intent, e.g.
    // "Querying `users`" — not the raw SQL) from the registry/dynamic entry.
    // Fall back to a generic arg grab for tools that don't declare one.
    const declared = getHeaderSubtitle(
      headerTool.toolName,
      headerTool,
      headerTool.events,
    );
    if (declared && declared.length > 0) return declared;
    const args = headerTool.arguments ?? {};
    const val =
      (args as Record<string, unknown>).query ??
      (args as Record<string, unknown>).q ??
      (args as Record<string, unknown>).search;
    if (typeof val === "string" && val.length > 0) return val;
    if (Array.isArray(val) && val.length > 0) return String(val[0]);
    return null;
  })();

  // The verb-phrase label that explains what happened. Status is conveyed by
  // tense ("Updating plan" while running -> "Updated plan" complete -> "Failed
  // to update plan: <reason>" on error), not by a status icon. Per-tool labels
  // live in the registry; common widget tools have built-in fallbacks; the
  // rest fall back to the displayName as-is.
  const phaseLabel = getToolPhaseLabel(
    headerTool?.toolName ?? null,
    toolDisplayName,
    phase,
    headerTool?.errorMessage ?? null,
  );

  // Query subtitle (e.g. "AI lawyers" for a search) — kept ONLY when it adds
  // information that the verb-phrase label doesn't already convey. Dropped
  // entirely on error (the error reason is already in the main label).
  const querySubtitle: string | null =
    phase === "error" ? null : headerSubtitle;

  if (entries.length === 0) return null;

  const handleOpenOverlay = (tabId?: string) => {
    setInitialOverlayTab(tabId);
    setIsOverlayOpen(true);
  };

  const handleOpenWindowPanel = (initialTab?: string) => {
    // Live mode: ONE window per request. Re-clicking from any tool group in
    // the same request focuses the same window, and `callIds: []` tells the
    // panel "show every tool in the request" via LiveEntriesProvider — so
    // the sidebar fills up as new tools stream in. The clicked tool is
    // hinted via initialCallId so the window opens focused on it.
    //
    // Snapshot mode (no requestId): each group is a self-contained snapshot.
    // Stable per-group id keeps re-clicks from spawning duplicates.
    const seedCallId = entries[0]?.callId ?? "no-entry";
    const instanceId = requestId
      ? `tool-call-request-${requestId}`
      : `tool-call-snapshot-${seedCallId}`;
    dispatch(
      openOverlay({
        overlayId: "toolCallWindow",
        instanceId,
        data: {
          requestId: requestId ?? null,
          callIds: requestId ? [] : entries.map((e) => e.callId),
          entries: requestId ? null : entries,
          initialCallId: seedCallId !== "no-entry" ? seedCallId : null,
          initialTab: initialTab ?? null,
        },
      }),
    );
  };

  return (
    <div
      className={cn(
        "group/toolcard relative my-0.5 w-full overflow-hidden rounded-sm",
        // No persistent border — only on hover, so the row reads as plain text
        // height. The collapsed state is a single line in the transcript.
        "border border-transparent hover:border-border/60",
        className,
      )}
    >
      <button
        onClick={() => setIsExpanded((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between px-1.5 py-0.5 text-left transition-colors",
          isExpanded && "border-b border-border/40",
        )}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Verb-phrase label. Tense conveys state — no status icon. The
              shimmer treatment on the running form supplies the motion cue. */}
          {phase === "processing" || phase === "starting" ? (
            <ShimmerText
              text={phaseLabel}
              className="truncate text-xs font-medium"
            />
          ) : (
            <span
              className={cn(
                "truncate text-xs font-medium",
                // Errors stay calm — a recessive label, details behind the click.
                phase === "error" ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {phaseLabel}
            </span>
          )}
          {querySubtitle &&
            (phase === "processing" || phase === "starting" ? (
              <ShimmerText
                text={`· ${querySubtitle}`}
                className="truncate text-xs"
              />
            ) : (
              <span className="truncate text-xs text-muted-foreground">
                · {querySubtitle}
              </span>
            ))}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {/* Action buttons — hover-only so the row stays a clean single line. */}
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/toolcard:opacity-100">
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                handleOpenWindowPanel();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  handleOpenWindowPanel();
                }
              }}
              className="p-0.5 hover:bg-muted rounded transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
              title="Open in floating window"
            >
              <PanelRightOpen className="w-3 h-3" />
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                setInitialOverlayTab(undefined);
                setIsOverlayOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  setInitialOverlayTab(undefined);
                  setIsOverlayOpen(true);
                }
              }}
              className="p-0.5 hover:bg-muted rounded transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
              title="Open fullscreen overlay"
            >
              <Maximize2 className="w-3 h-3" />
            </span>
          </div>
          {/* Chevron — always visible so the user knows the row is expandable */}
          {isExpanded ? (
            <ChevronUp className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="space-y-1.5 px-1.5 py-1">
          {entries.map((entry) => {
            const InlineRenderer = getInlineRenderer(entry.toolName);
            const groupDisplayName = getToolDisplayName(entry.toolName);
            return (
              <div key={entry.callId}>
                {entries.length > 1 && (
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    {groupDisplayName}
                  </div>
                )}
                <InlineRenderer
                  entry={entry}
                  events={entry.events}
                  onOpenOverlay={handleOpenOverlay}
                  onOpenWindowPanel={handleOpenWindowPanel}
                  toolGroupId={entry.callId}
                  isPersisted={isPersisted}
                  conversationId={conversationId}
                />
              </div>
            );
          })}
        </div>
      )}

      <ToolUpdatesOverlay
        isOpen={isOverlayOpen}
        onClose={() => {
          setIsOverlayOpen(false);
          setInitialOverlayTab(undefined);
        }}
        entries={entries}
        initialTab={initialOverlayTab}
      />
    </div>
  );
};

// ─── Public component ─────────────────────────────────────────────────────────

export const ToolCallVisualization: React.FC<ToolCallVisualizationProps> = ({
  entries,
  requestId,
  conversationId,
  hasContent,
  isPersisted,
  className,
}) => (
  <ToolCallVisualizationInner
    entries={entries}
    requestId={requestId}
    conversationId={conversationId}
    hasContent={hasContent}
    isPersisted={isPersisted}
    className={className}
  />
);

export default ToolCallVisualization;
