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
import { prefetchToolRenderer } from "../db-renderer/toolRendererCache";
import { useAutoScrollOnStream } from "../renderers/useAutoScrollOnStream";
import {
  getToolCardUserChoice,
  setToolCardUserChoice,
  markToolCardLive,
  wasToolCardLive,
} from "./toolCardUiSession";
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
  // DEFAULT ("auto"): a live tool opens and STAYS open (one-way motion — the
  // transcript never shifts on its own); a fresh-session persisted tool
  // mounts collapsed. Tool override (registry `displayMode`): "stay-open"
  // (open even when persisted) | "never-open" (never auto-open). User
  // preference wins over both: "verbose" (always open) | "minimal" (never
  // auto-open).
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

  // ─── Expand state — motion is ONE-WAY, memory survives remounts ──────────
  //
  // THE RULE (owner-specified): the transcript must never shift on its own.
  // A tool that opened live STAYS open — no 3s timer, no collapse-when-the-
  // next-tool-starts. The ONLY thing that collapses a card is the user's
  // click. Reloaded (fresh-session persisted) tools mount as collapsed lines.
  //
  // State lives in the module-scoped session map (`toolCardUiSession`), NOT
  // per-mount useState — tool cards are remounted constantly during a live
  // turn (a single slot becomes a `tool_batch` when the next consecutive tool
  // starts; the whole turn flips live → persisted at stream end), and
  // per-mount state re-ran the open→3s→collapse cycle on every remount (the
  // "finished tools popping open all over the transcript" bug).
  const primaryCallId = headerTool?.callId ?? null;
  const [userChoice, setUserChoiceState] = useState<boolean | null>(() =>
    getToolCardUserChoice(primaryCallId),
  );
  const setUserChoice = (open: boolean) => {
    setToolCardUserChoice(primaryCallId, open);
    setUserChoiceState(open);
  };

  // Remember that this call rendered live this session, so it stays open
  // across the live→persisted remount at stream end.
  useEffect(() => {
    if (!isPersisted) markToolCardLive(primaryCallId);
  }, [isPersisted, primaryCallId]);

  // The automatic expand decision (no user override). Errors NEVER default to
  // expanded — even a stay-open tool collapses to one calm line on error.
  const autoExpanded =
    phase === "error"
      ? false
      : effectiveMode === "stay-open"
        ? true
        : effectiveMode === "never-open"
          ? false
          : !isPersisted || wasToolCardLive(primaryCallId);

  const isExpanded = userChoice ?? autoExpanded;
  const toggleExpand = () => setUserChoice(!isExpanded);

  // Card chrome follows the same one-way rule: a live card is open and stays
  // open; a fresh-session persisted card mounts collapsed. User click sticks.
  const cardOpen =
    userChoice ?? (!isPersisted || wasToolCardLive(primaryCallId));
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

  // The expanded body is height-capped with internal scroll (see below) so a
  // streaming result NEVER grows the card's footprint unboundedly. While the
  // tool streams, the body FOLLOWS the freshest content only while it is
  // already at the bottom — one scroll away detaches it. It never blocks a
  // scroll (see `useAutoScrollOnStream`).
  const bodyScrollRef = useAutoScrollOnStream<HTMLDivElement>(
    headerTool,
    streamingNow,
  );

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
          conversationId: conversationId ?? null,
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
          onOpenOverlay={handleOpenOverlay}
          onOpenWindowPanel={handleOpenWindowPanel}
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
            {/* Height-capped viewport: a result NEVER grows the transcript
                unboundedly. While streaming it follows the freshest content
                only while already at the bottom; a scroll detaches it.
                Content fades in rather than slamming into place. */}
            <div
              ref={bodyScrollRef}
              className={cn(
                "max-h-[26rem] space-y-1 overflow-y-auto overscroll-contain bg-transparent animate-in fade-in duration-300",
                // Artifact mode: the body attaches seamlessly to the header
                // bar (zero gap — the renderer continues the header's sheet).
                artifact ? "mt-0" : "mt-0.5",
              )}
            >
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
                        attached={!!artifact}
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
