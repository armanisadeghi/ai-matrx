"use client";

/**
 * BattleColumn
 *
 * One column in the comparison grid. Header (agent/version dropdowns +
 * controls) on top, then the conversation surface, then the input.
 *
 * Composed manually instead of using AgentConversationColumn directly so we
 * can place the ResponseFeedbackBar INSIDE the scroll area, right under
 * the last assistant message (per the design call: "directly after the
 * assistant message, full width of the response area").
 *
 * The pieces below the conversation (CreatorRunPanel + SmartAgentInput)
 * are the same primitives AgentConversationColumn uses — we just rewire
 * the layout.
 */

import { ChevronsLeftRight } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAgentName } from "@/features/agents/redux/agent-definition/selectors";
import { cn } from "@/lib/utils";
import { BattleColumnHeader } from "./BattleColumnHeader";
import { BoundColumn } from "../shared/BoundColumn";
import { BATTLE_SURFACE_KEY } from "../redux/thunks";
import type { BattleColumn as BattleColumnType } from "../types";

interface BattleColumnProps {
  column: BattleColumnType;
  onToggleCollapse: () => void;
}

export function BattleColumn({ column, onToggleCollapse }: BattleColumnProps) {
  // When collapsed, the resizable panel is forced down to 44px wide. The
  // full UI doesn't fit (and would jitter on every animation tick anyway),
  // so we swap to a vertical-rail "click to expand" affordance.
  if (column.collapsed) {
    return (
      <CollapsedColumnView column={column} onExpand={onToggleCollapse} />
    );
  }
  return (
    <div className="h-full flex flex-col min-w-0 min-h-0 bg-background">
      <BattleColumnHeader
        column={column}
        onToggleCollapse={onToggleCollapse}
      />
      <div className="flex-1 overflow-hidden flex justify-center min-w-0">
        {column.agentId ? (
          <BoundColumn
            conversationId={column.conversationId}
            surfaceKey={BATTLE_SURFACE_KEY}
          />
        ) : (
          <EmptyAgentState />
        )}
      </div>
    </div>
  );
}

/**
 * Compact view rendered inside a collapsed (44px) panel. Vertical agent
 * name + a prominent expand button so the user never loses track of the
 * fact that a column exists there.
 */
function CollapsedColumnView({
  column,
  onExpand,
}: {
  column: BattleColumnType;
  onExpand: () => void;
}) {
  const agentName = useAppSelector((s) =>
    column.agentId ? selectAgentName(s, column.agentId) : null,
  );
  return (
    <button
      type="button"
      onClick={onExpand}
      title={`Expand column${agentName ? ` (${agentName})` : ""}`}
      className={cn(
        "h-full w-full flex flex-col items-center justify-between py-2",
        "border-x border-dashed border-primary/40 bg-primary/5",
        "hover:bg-primary/10 hover:border-primary transition-colors",
        "group",
      )}
    >
      <div className="w-6 h-6 rounded-full flex items-center justify-center bg-primary text-primary-foreground shadow-sm group-hover:scale-110 transition-transform">
        <ChevronsLeftRight className="w-3.5 h-3.5" strokeWidth={2.5} />
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden py-2">
        <span
          className={cn(
            "text-[11px] font-semibold uppercase tracking-wider truncate max-h-full",
            "[writing-mode:vertical-rl] rotate-180",
            agentName ? "text-primary" : "text-muted-foreground/60",
          )}
        >
          {agentName ?? "Empty column"}
        </span>
      </div>
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
        collapsed
      </span>
    </button>
  );
}

function EmptyAgentState() {
  return (
    <div className="h-full flex items-center justify-center text-center px-4">
      <div className="text-xs text-muted-foreground max-w-[220px]">
        Pick an agent above to set up this column. Each column is independent —
        different agents, different versions, different inputs.
      </div>
    </div>
  );
}
