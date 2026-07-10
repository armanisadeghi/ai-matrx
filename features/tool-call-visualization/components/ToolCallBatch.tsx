"use client";

/**
 * ToolCallBatch
 *
 * Folds a run of CONSECUTIVE tool calls (the agent firing several tools
 * back-to-back without speaking) into ONE lightweight summary line that
 * expands to reveal the individual tool cards flat below it.
 *
 * Design constraint (owner-specified): do NOT wrap the individual tools in a
 * bordered/padded container — that "3-layer nest" deforms the tool cards. The
 * batch is JUST a line (a toggle). When expanded, `children` are the normal,
 * full tool cards (`InlineToolCard` / `DbToolCard` → `ToolCallVisualization`),
 * rendered as flat siblings under the line — each keeps its own collapse and
 * full width. A subtle left rail is the only grouping affordance.
 *
 * Collapse behavior mirrors `ToolCallVisualization` — motion is ONE-WAY:
 *   a live batch opens and STAYS open (no timer, no auto-collapse; the
 *   transcript never shifts on its own). A fresh-session persisted batch
 *   mounts collapsed. User preference wins: "verbose" = always open,
 *   "minimal" = never auto-open. A user click sticks for the session,
 *   surviving remounts (state lives in `toolCardUiSession`, keyed by the
 *   run's first callId).
 *
 * This component owns NO data subscription — the live/persisted wrappers
 * (`InlineToolBatch` / `DbToolBatch`) compute `entries` (for the count +
 * streaming state) and hand over the already-rendered tool cards as children.
 */

import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { ShimmerText } from "@/components/loaders/ShimmerText";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

import { getToolDisplayName } from "../registry/registry";
import { useDbToolMeta } from "../db-renderer/useDbToolMeta";
import { selectToolDisplayPreference } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import {
  getToolCardUserChoice,
  setToolCardUserChoice,
  markToolCardLive,
  wasToolCardLive,
} from "./toolCardUiSession";

export interface ToolCallBatchProps {
  /** One entry per tool in the run — drives the count + streaming state. */
  entries: ToolLifecycleEntry[];
  /** Persisted snapshot (reload) — never "streaming", so default collapsed. */
  isPersisted?: boolean;
  /** For the user-preference (verbose/minimal) lookup. */
  conversationId?: string;
  /** The pre-rendered individual tool cards, in order. */
  children: React.ReactNode;
  className?: string;
}

export const ToolCallBatch: React.FC<ToolCallBatchProps> = ({
  entries,
  isPersisted = false,
  conversationId,
  children,
  className,
}) => {
  const count = entries.length;

  const anyActive = entries.some(
    (e) =>
      e.status === "started" || e.status === "progress" || e.status === "step",
  );
  const streamingNow = !isPersisted && anyActive;
  // NOTE: the batch header is NEVER colored as an error. A run where one call
  // failed and a later one succeeded (the agent fixing its own bad arguments)
  // is a SUCCESS — coloring the group red mislabels it. A genuine turn failure
  // surfaces at the turn level (the assistant error card), not here.

  // When every tool in the run is the same kind, name it ("Updated `tool_def`
  // · 10 calls"); otherwise stay generic ("10 tool calls").
  const uniformToolName = (() => {
    const first = entries[0]?.toolName;
    if (!first) return null;
    return entries.every((e) => e.toolName === first) ? first : null;
  })();
  // DB renderer's declared label for a uniform run (e.g. "Directory · 6 calls").
  const uniformMeta = useDbToolMeta(uniformToolName);
  const label = (() => {
    if (uniformToolName) {
      const name =
        uniformMeta?.displayName ?? getToolDisplayName(uniformToolName);
      return `${name} · ${count} calls`;
    }
    return `${count} tool calls`;
  })();

  // ─── Collapse behavior: one-way motion, session-lived memory ─────────────
  const userPref = useAppSelector(selectToolDisplayPreference(conversationId));
  const effectiveMode: "auto" | "stay-open" | "never-open" =
    userPref === "verbose"
      ? "stay-open"
      : userPref === "minimal"
        ? "never-open"
        : "auto";

  // Batch identity survives remounts + the live→persisted flip: the run's
  // first callId. (The batch component remounts when the run grows or the
  // turn flips to the persisted path — per-mount state re-ran the open/
  // collapse cycle; the session map doesn't.)
  const batchKey = entries[0]?.callId ? `batch:${entries[0].callId}` : null;
  const [userChoice, setUserChoiceState] = useState<boolean | null>(() =>
    getToolCardUserChoice(batchKey),
  );

  // A batch that rendered live this session stays open after the flip.
  useEffect(() => {
    if (!isPersisted) markToolCardLive(batchKey);
  }, [isPersisted, batchKey]);

  const autoExpanded =
    effectiveMode === "never-open"
      ? false
      : effectiveMode === "stay-open"
        ? true
        : !isPersisted || wasToolCardLive(batchKey);
  const isExpanded = userChoice ?? autoExpanded;

  // Mount the body once it has EVER been open so the close can animate and the
  // live tool cards keep their state. A persisted/never-opened batch never
  // mounts its tools → no needless re-render/re-fetch on reload. Latched via
  // the React-endorsed "adjust state during render" pattern.
  const [hasEverExpanded, setHasEverExpanded] = useState<boolean>(isExpanded);
  if (isExpanded && !hasEverExpanded) setHasEverExpanded(true);

  if (count === 0) return null;

  return (
    <div className={cn("group/toolbatch relative w-full mb-2", className)}>
      <button
        type="button"
        onClick={() => {
          setToolCardUserChoice(batchKey, !isExpanded);
          setUserChoiceState(!isExpanded);
        }}
        className="flex w-full items-center gap-1.5 text-left"
      >
        {/* Same font/size as body markdown + tool lines, just dimmer — reads as
            part of the response, not a separate widget. */}
        {streamingNow ? (
          <ShimmerText
            text={`Running ${count} tools…`}
            className="truncate font-sans text-sm leading-relaxed tracking-wide"
          />
        ) : (
          <span className="truncate font-sans text-sm leading-relaxed tracking-wide text-muted-foreground">
            {label}
          </span>
        )}
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
      </button>

      {/* Expanded body: the individual tool cards rendered FLAT below the line.
          A subtle left rail groups them without a deforming box. Animates via
          the grid-rows trick (matches ToolCallVisualization). */}
      {hasEverExpanded && (
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-500 ease-in-out",
            isExpanded
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <div className="mt-1 ml-1 border-l border-border/50 pl-3">
              {children}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolCallBatch;
