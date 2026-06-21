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
 * Collapse behavior mirrors `ToolCallVisualization` (the 3-layer system):
 *   DEFAULT "auto" — expanded while ANY tool in the run is streaming, then
 *   auto-collapses 3s after they all finish. User preference wins:
 *   "verbose" = always open, "minimal" = never auto-open. Once the user
 *   clicks, their choice sticks (no auto-collapse fighting them).
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
import { selectToolDisplayPreference } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";

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
  const allTerminal =
    count > 0 &&
    entries.every((e) => e.status === "completed" || e.status === "error");
  const anyError = entries.some((e) => e.status === "error");
  const streamingNow = !isPersisted && anyActive;

  // When every tool in the run is the same kind, name it ("Updated `tool_def`
  // · 10 calls"); otherwise stay generic ("10 tool calls").
  const uniformToolName = (() => {
    const first = entries[0]?.toolName;
    if (!first) return null;
    return entries.every((e) => e.toolName === first) ? first : null;
  })();
  const label = (() => {
    if (uniformToolName) {
      return `${getToolDisplayName(uniformToolName)} · ${count} calls`;
    }
    return `${count} tool calls`;
  })();

  // ─── Collapse behavior: default "auto" → user preference override ─────────
  const userPref = useAppSelector(selectToolDisplayPreference(conversationId));
  const effectiveMode: "auto" | "stay-open" | "never-open" =
    userPref === "verbose"
      ? "stay-open"
      : userPref === "minimal"
        ? "never-open"
        : "auto";

  const [isExpanded, setIsExpanded] = useState<boolean>(() =>
    effectiveMode === "never-open"
      ? false
      : effectiveMode === "stay-open"
        ? true
        : streamingNow,
  );
  const [userToggled, setUserToggled] = useState(false);
  // Mount the body once it has EVER been open so the close can animate and the
  // live tool cards keep their state. A persisted/never-opened batch never
  // mounts its tools → no needless re-render/re-fetch on reload.
  const [hasEverExpanded, setHasEverExpanded] = useState<boolean>(isExpanded);
  useEffect(() => {
    if (isExpanded && !hasEverExpanded) setHasEverExpanded(true);
  }, [isExpanded, hasEverExpanded]);

  // Auto: keep expanded while streaming; collapse 3s after the run finishes.
  useEffect(() => {
    if (effectiveMode !== "auto" || userToggled) return;
    if (streamingNow) {
      setIsExpanded(true);
      return;
    }
    if (allTerminal && isExpanded) {
      const t = setTimeout(() => setIsExpanded(false), 3000);
      return () => clearTimeout(t);
    }
  }, [effectiveMode, userToggled, streamingNow, allTerminal, isExpanded]);

  if (count === 0) return null;

  return (
    <div className={cn("group/toolbatch relative w-full mb-2", className)}>
      <button
        type="button"
        onClick={() => {
          setUserToggled(true);
          setIsExpanded((v) => !v);
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
          <span
            className={cn(
              "truncate font-sans text-sm leading-relaxed tracking-wide",
              anyError ? "text-destructive/80" : "text-muted-foreground",
            )}
          >
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
