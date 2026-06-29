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
  ChevronRight,
  Maximize2,
  PanelRightOpen,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { ShimmerText } from "@/components/loaders/ShimmerText";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

import {
  getInlineRenderer,
  getToolDisplayName,
  getToolPhaseLabel,
  getHeaderSubtitle,
  getToolDisplayMode,
  getToolGlyph,
  getToolChrome,
} from "../registry/registry";
import { ToolGlyph } from "../renderers/_shared-entity/ToolGlyph";
import { selectToolDisplayPreference } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectIsLatestToolActivity } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { prefetchToolRenderer } from "../db-renderer/toolRendererCache";
import { useDbToolMeta } from "../db-renderer/useDbToolMeta";
import { ToolErrorCard } from "../result-fields/ToolErrorCard";
import { ToolUpdatesOverlay } from "./ToolUpdatesOverlay";
import { getToolArtifact } from "../registry/toolArtifact";
import { ArtifactResultBar } from "./ArtifactResultBar";

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

/** Fallback when there's no live request to check latest-activity against. */
const SELECT_LATEST_TRUE = () => true;

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
  const dispatch = useAppDispatch();

  // ─── Entries-derived state ──────────────────────────────────────────────
  const anyActive = entries.some(
    (e) =>
      e.status === "started" || e.status === "progress" || e.status === "step",
  );
  const allTerminal =
    entries.length > 0 &&
    entries.every((e) => e.status === "completed" || e.status === "error");
  const headerTool = entries[0] ?? null;
  // Actively streaming RIGHT NOW (live only — a reloaded snapshot is never "streaming").
  const streamingNow = !isPersisted && anyActive;

  const phase: "starting" | "processing" | "complete" | "error" =
    entries.length === 0
      ? "starting"
      : anyActive || !allTerminal
        ? "processing"
        : entries.some((e) => e.status === "error")
          ? "error"
          : "complete";

  // ─── Display behavior: default → tool override → user preference ─────────
  // DEFAULT ("auto"): expand WHILE streaming, then auto-collapse 3s after done.
  // Tool override (registry `displayMode`): "stay-open" (never auto-collapse) |
  // "never-open" (never auto-open). User preference wins over both:
  // "verbose" (always open) | "minimal" (never auto-open).
  const userPref = useAppSelector(selectToolDisplayPreference(conversationId));
  // A DB renderer's author-declared label (e.g. "Weather" for `travel_get_weather`).
  // Resolves async on first sight, then re-renders — so a fully DB-authored tool
  // controls its collapsed line, not just its expanded body.
  const dbMeta = useDbToolMeta(headerTool?.toolName ?? null);
  const toolMode = getToolDisplayMode(headerTool?.toolName ?? null);
  const effectiveMode: "auto" | "stay-open" | "never-open" =
    userPref === "verbose"
      ? "stay-open"
      : userPref === "minimal"
        ? "never-open"
        : toolMode;

  // Glossy per-tool glyph for the folded line. Card chrome: a self-headed entity
  // card — once the tool COMPLETES the shell renders the InlineComponent
  // directly (no fold line / chevron / hover icons); while streaming it keeps
  // the slim row so there's a working indicator.
  const glyph = getToolGlyph(headerTool?.toolName ?? null);
  const HeaderInline =
    headerTool && headerTool.status !== "error"
      ? getInlineRenderer(headerTool.toolName)
      : null;
  const cardMode =
    getToolChrome(headerTool?.toolName ?? null) === "card" &&
    allTerminal &&
    phase !== "error" &&
    entries.length === 1 &&
    !!HeaderInline;

  // Expand state is DERIVED, not effect-synced (avoids cascading setState-in-
  // effect). Three inputs combine:
  //   1. userChoice — the user's explicit toggle. Once set it STICKS and wins.
  //   2. autoExpanded — the automatic decision, computed purely from phase/mode/
  //      streaming below.
  //   3. autoCollapsed — the auto "3s after a live finish" grace having elapsed.
  //      The ONLY effect-set state, and it's set from a timer callback, never
  //      synchronously in an effect body.
  const [userChoice, setUserChoice] = useState<boolean | null>(null);
  const [autoCollapsed, setAutoCollapsed] = useState(false);

  // The automatic expand decision (no user override). Pure, except the grace,
  // which rides on `autoCollapsed` (a timer flips it). Errors NEVER default to
  // expanded — even a stay-open tool collapses to one calm line on error. A
  // LIVE tool (`!isPersisted`) that's done stays open for the 3s grace; a
  // persisted/reloaded tool collapses the moment it mounts done.
  const autoExpanded =
    phase === "error"
      ? false
      : effectiveMode === "stay-open"
        ? true
        : effectiveMode === "never-open"
          ? false
          : streamingNow
            ? true
            : allTerminal && !isPersisted && !autoCollapsed;

  const isExpanded = userChoice ?? autoExpanded;
  const toggleExpand = () => setUserChoice(!isExpanded);

  // Card-chrome collapse: a card OPENS the moment it completes (it's the latest
  // activity in the turn) and auto-collapses the instant the next thing starts
  // (it's no longer the latest). A user click overrides and sticks. A
  // persisted/reloaded card mounts collapsed (it's old). No 3s timer — the card
  // tracks real stream position, not a clock.
  const isLatest = useAppSelector(
    headerTool && requestId
      ? selectIsLatestToolActivity(requestId, headerTool.callId)
      : SELECT_LATEST_TRUE,
  );
  const cardOpen = userChoice ?? (isPersisted ? false : isLatest);
  const toggleCard = () => setUserChoice(!cardOpen);

  // Mount the body once it has EVER been open, so the collapse can animate and a
  // live renderer keeps its state. A persisted/never-opened tool never mounts its
  // body → no needless re-fetch/re-run on reload. Latched via the React-endorsed
  // "adjust state during render" pattern (converges in one pass; not an effect).
  const [hasEverExpanded, setHasEverExpanded] = useState<boolean>(isExpanded);
  if (isExpanded && !hasEverExpanded) setHasEverExpanded(true);

  const [isOverlayOpen, setIsOverlayOpen] = useState<boolean>(false);
  const [initialOverlayTab, setInitialOverlayTab] = useState<
    string | undefined
  >(undefined);

  // Auto mode's 3s collapse after a LIVE finish. setState fires ONLY from the
  // timer callback (deferred) — the effect body never sets state synchronously.
  // stay-open / never-open never auto-collapse; an error already derives
  // collapsed; a persisted/reloaded tool gets no grace.
  useEffect(() => {
    if (userChoice !== null) return undefined; // user took control — their choice sticks
    if (effectiveMode !== "auto") return undefined;
    if (phase === "error") return undefined;
    if (!allTerminal) return undefined;
    if (isPersisted) return undefined;
    if (autoCollapsed) return undefined;
    const t = setTimeout(() => setAutoCollapsed(true), 3000);
    return () => clearTimeout(t);
  }, [userChoice, effectiveMode, phase, allTerminal, isPersisted, autoCollapsed]);

  // Prefetch any DB-stored renderers so they're ready before the body mounts.
  useEffect(() => {
    for (const e of entries) {
      if (e.toolName) prefetchToolRenderer(e.toolName);
    }
  }, [entries]);

  const toolDisplayName =
    entries.length > 1
      ? `${entries.length} Tools`
      : !headerTool
        ? getToolDisplayName(null)
        : // A DB renderer's declared label is authoritative for its own tool —
          // it wins over the raw as-called name. (In-code tools have no dbMeta,
          // so they keep the entry.displayName → registry path unchanged.)
          dbMeta?.displayName
          ? dbMeta.displayName
          : headerTool.displayName &&
              headerTool.displayName !== headerTool.toolName
            ? headerTool.displayName
            : getToolDisplayName(headerTool.toolName);

  const headerSubtitle = ((): string | null => {
    if (!headerTool) return null;
    // (1) In-code registry's DECLARED subtitle (a friendly intent, e.g.
    // "Querying `users`" — not the raw SQL).
    const declared = getHeaderSubtitle(
      headerTool.toolName,
      headerTool,
      headerTool.events,
    );
    if (declared && declared.length > 0) return declared;
    // (2) DB renderer's author-declared subtitle (`header_subtitle_code`,
    // compiled to `(entry, events) => string`). Best-effort — a throwing or
    // non-string subtitle is ignored, never fatal.
    if (dbMeta?.subtitle) {
      try {
        const s = dbMeta.subtitle(headerTool, headerTool.events);
        if (typeof s === "string" && s.length > 0) return s;
      } catch {
        // ignore — fall through to the generic arg grab
      }
    }
    // (3) Generic fallback — the single most informative argument. Covers the
    // common case (path / command / city / key / query) with zero per-tool work.
    const args = (headerTool.arguments ?? {}) as Record<string, unknown>;
    const val =
      args.query ??
      args.q ??
      args.search ??
      args.path ??
      args.command ??
      args.city ??
      args.key ??
      args.sql ??
      args.url ??
      args.table;
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

  // A completed tool that left behind an openable artifact (a working-document
  // patch, a saved/edited note) gets a persistent, full-width ArtifactResultBar
  // instead of the dim collapsed line — advertising the result + opening the
  // final version. Single-entry only (a batch has no single artifact); each kind
  // needs its open handle (working document → conversationId; note → its id).
  const artifactRaw =
    phase === "complete" && entries.length === 1
      ? getToolArtifact(headerTool)
      : null;
  const artifact =
    artifactRaw &&
    (artifactRaw.kind === "working_document"
      ? typeof conversationId === "string" && conversationId.length > 0
      : Boolean(artifactRaw.id))
      ? artifactRaw
      : null;

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
          // ALWAYS pass the current entries as a snapshot fallback — in live
          // mode the panel prefers the live store but falls back to this if it
          // has been pruned (reload/cleanup), so the panel is never empty.
          entries,
          initialCallId: seedCallId !== "no-entry" ? seedCallId : null,
          initialTab: initialTab ?? null,
        },
      }),
    );
  };

  return (
    <div
      className={cn(
        // No background, no border — collapsed, expanded, OR on hover. A tool
        // call reads as part of the response, and its vertical spacing matches
        // the gap between markdown paragraphs (`mb-2`) so it sits in the normal
        // text rhythm. The expanded body is borderless/paddingless too —
        // renderers bring their own cards.
        "group/toolcard relative w-full mb-2",
        className,
      )}
    >
      {artifact ? (
        <ArtifactResultBar
          artifact={artifact}
          conversationId={conversationId}
          peekExpanded={isExpanded}
          onTogglePeek={toggleExpand}
        />
      ) : cardMode && headerTool && HeaderInline ? (
        // Self-headed entity card — no fold line; the card's own header carries
        // the name + "Open in" menu. createElement (not JSX) since the component
        // is resolved at runtime from the registry.
        React.createElement(HeaderInline, {
          entry: headerTool,
          events: headerTool.events,
          onOpenOverlay: handleOpenOverlay,
          onOpenWindowPanel: handleOpenWindowPanel,
          toolGroupId: headerTool.callId,
          isPersisted,
          conversationId,
          requestId,
          expanded: cardOpen,
          onToggleExpanded: toggleCard,
        })
      ) : (
        <button
          type="button"
          onClick={toggleExpand}
          className="flex w-full items-center gap-1.5 text-left"
        >
          {/* Glossy per-tool glyph — gives the folded line a unique app-style
              icon instead of a flat one. */}
          <ToolGlyph icon={glyph.icon} accent={glyph.accent} size="sm" />
          {/* Label + subtitle — SAME font/size as body markdown text, just dimmer,
            so the tool call reads as part of the response, not a separate box. */}
        <span className="flex min-w-0 items-center gap-1.5">
          {phase === "processing" || phase === "starting" ? (
            <ShimmerText
              text={phaseLabel}
              className="truncate font-sans text-sm leading-relaxed tracking-wide"
            />
          ) : (
            <span className="truncate font-sans text-sm leading-relaxed tracking-wide text-muted-foreground">
              {phaseLabel}
            </span>
          )}
          {querySubtitle &&
            (phase === "processing" || phase === "starting" ? (
              <ShimmerText
                text={`· ${querySubtitle}`}
                className="truncate font-sans text-sm leading-relaxed tracking-wide"
              />
            ) : (
              <span className="truncate font-sans text-sm leading-relaxed tracking-wide text-muted-foreground/70">
                · {querySubtitle}
              </span>
            ))}
        </span>

        {/* Chevron follows the END of the text (not pushed to the far right).
            Collapsed points right; opening turns it down. */}
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}

        {/* Action buttons — hover-only, after the chevron. */}
        <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/toolcard:opacity-100">
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
            className="cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Open in floating window"
          >
            <PanelRightOpen className="h-3 w-3" />
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
            className="cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Open fullscreen overlay"
          >
            <Maximize2 className="h-3 w-3" />
          </span>
        </span>
        </button>
      )}

      {/* Expanded body: drops BELOW the chevron line — NO border, NO padding,
          TRANSPARENT background, so the renderer reads as part of the response
          (renderers bring their own cards). Animates open/closed via the
          grid-rows trick. Mounted once it has ever been opened so the close can
          animate (and live renderers keep their state). */}
      {!cardMode && hasEverExpanded && (
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-500 ease-in-out",
            isExpanded
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <div className="mt-0.5 space-y-1 bg-transparent">
              {entries.map((entry) => {
                const groupDisplayName = getToolDisplayName(entry.toolName);
                // An errored tool call gets the calm ToolErrorCard for EVERY
                // tool (not just generic ones) — a tool error is usually the
                // agent's bad arguments, a routine retry signal, not an app
                // failure. Short-circuit BEFORE resolving the renderer so an
                // errored DB tool doesn't fetch/compile a body it won't show.
                const isErrored = entry.status === "error";
                const InlineRenderer = isErrored
                  ? null
                  : getInlineRenderer(entry.toolName);
                return (
                  <div key={entry.callId}>
                    {entries.length > 1 && (
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {groupDisplayName}
                      </div>
                    )}
                    {isErrored || !InlineRenderer ? (
                      <ToolErrorCard
                        entry={entry}
                        onOpenOverlay={handleOpenOverlay}
                        toolGroupId={entry.callId}
                      />
                    ) : (
                      <InlineRenderer
                        entry={entry}
                        events={entry.events}
                        onOpenOverlay={handleOpenOverlay}
                        onOpenWindowPanel={handleOpenWindowPanel}
                        toolGroupId={entry.callId}
                        isPersisted={isPersisted}
                        conversationId={conversationId}
                        requestId={requestId}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
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
