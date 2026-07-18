"use client";

/**
 * AgentWorkGroup
 *
 * The SETTLED-turn fold: a run of thinking runs, tool calls, and short
 * spoken asides collapses into ONE quiet line — "Worked for 26s" — that
 * expands to the original items rendered flat below it.
 *
 * Design constraints (owner-specified, mirror of `ToolCallBatch`):
 *   - The group is JUST a line. No card, no border, no indent, no left rail —
 *     any offset wrapper deforms the children and reads as nesting. When
 *     expanded, `children` are the exact components the transcript would have
 *     rendered ungrouped (ThinkingTrace, tool cards, short markdown), as flat
 *     full-width siblings.
 *   - Grouping happens only once a turn is settled (post-stream / DB-loaded),
 *     in `EnhancedChatMarkdown` via `foldAgentWork` — never mid-stream.
 *   - Collapsed by default: the whole point is muting settled process noise.
 *     User preference "verbose" keeps it open. A user click sticks for the
 *     session (survives remounts and the live→persisted flip) via
 *     `toolCardUiSession`.
 *   - **ONE header per logical turn.** A multi-iteration turn spans several
 *     `cx_message` rows, each with its own fold — inside an
 *     `AgentWorkTurnProvider` (mounted by `AssistantTurnGroup`) all of a
 *     turn's groups merge: the first renders the single "Worked for Ns"
 *     header with SUMMED duration/steps, the rest render children only, and
 *     one click expands everything. Never "Worked for 4s" stacked on
 *     "Worked for 3s".
 *
 * The header sells the work: duration when timestamps exist ("Worked for
 * 26s"), step count otherwise ("Worked through 6 steps").
 */

import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectToolDisplayPreference } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";

import { formatWorkDuration } from "../grouping/foldAgentWork";
import { useAgentWorkTurnMembership } from "./agentWorkTurn";
import {
  getToolCardUserChoice,
  setToolCardUserChoice,
} from "./toolCardUiSession";

export interface AgentWorkGroupProps {
  /**
   * Stable session identity for the expand/collapse memory — survives the
   * live→persisted remount. Callers key it off the group's first stable id
   * (e.g. `agent-work:<first callId or seq>`).
   */
  sessionKey: string | null;
  /** Position of this group within its message — orders groups in a turn. */
  order?: number;
  /** Wall-clock span of the folded work, when computable. */
  durationMs: number | null;
  /** Human step count (thinking runs + individual tool calls + asides). */
  stepCount: number;
  /** For the user-preference (verbose/minimal) lookup. */
  conversationId?: string;
  /** The pre-rendered folded items, in original order. */
  children: React.ReactNode;
  className?: string;
}

export const AgentWorkGroup: React.FC<AgentWorkGroupProps> = ({
  sessionKey,
  order = 0,
  durationMs,
  stepCount,
  conversationId,
  children,
  className,
}) => {
  const userPref = useAppSelector(selectToolDisplayPreference(conversationId));

  // Turn-level coordination (null outside an AssistantTurnGroup).
  const turn = useAgentWorkTurnMembership({
    id: sessionKey ?? `agent-work-order-${order}`,
    order,
    durationMs,
    stepCount,
  });

  const [userChoice, setUserChoiceState] = useState<boolean | null>(() =>
    getToolCardUserChoice(sessionKey),
  );

  // Settled process noise defaults collapsed; "verbose" users see everything.
  // In turn mode the choice is SHARED across the turn's groups.
  const standaloneExpanded = userChoice ?? userPref === "verbose";
  const isExpanded = turn
    ? (turn.expandedChoice ?? userPref === "verbose")
    : standaloneExpanded;

  const toggle = () => {
    if (turn) {
      turn.setExpanded(!isExpanded);
    } else {
      setToolCardUserChoice(sessionKey, !isExpanded);
      setUserChoiceState(!isExpanded);
    }
  };

  // Mount the body once it has EVER been open so the close animates and the
  // children keep their state; a never-opened group never mounts its items
  // (no needless re-render/re-fetch on reload). Same latch as ToolCallBatch.
  const [hasEverExpanded, setHasEverExpanded] = useState<boolean>(isExpanded);
  if (isExpanded && !hasEverExpanded) setHasEverExpanded(true);

  // In turn mode only the FIRST group renders the header, with the turn's
  // aggregate numbers; the rest are headerless bodies driven by the shared
  // expand state.
  const showHeader = !turn || turn.isPrimary;
  const headerDurationMs = turn ? turn.totalDurationMs : durationMs;
  const headerStepCount = turn ? turn.totalStepCount || stepCount : stepCount;

  const label =
    headerDurationMs !== null
      ? `Worked for ${formatWorkDuration(headerDurationMs)}`
      : `Worked through ${headerStepCount} ${headerStepCount === 1 ? "step" : "steps"}`;

  return (
    <div className={cn("group/agentwork relative w-full mb-2", className)}>
      {showHeader && (
        <button
          type="button"
          onClick={toggle}
          className="flex w-full items-center gap-1.5 text-left"
        >
          {/* Same font/size as body markdown + tool lines, just dimmer — reads
              as part of the response, not a separate widget. */}
          <span className="truncate font-sans text-sm leading-relaxed tracking-wide text-muted-foreground">
            {label}
          </span>
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
        </button>
      )}

      {/* Expanded body: the original items rendered FLAT below the line — no
          rail, no indent, no grouping box. Animates via the grid-rows trick
          (matches ToolCallVisualization / ToolCallBatch). */}
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
            <div className={cn(showHeader && "mt-1", "space-y-4")}>
              {children}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentWorkGroup;
