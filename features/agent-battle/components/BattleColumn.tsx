"use client";

/**
 * BattleColumn
 *
 * A single column in the comparison grid. Header (agent/version dropdowns +
 * controls) on top, AgentConversationColumn below.
 *
 * The AgentConversationColumn already does everything we need per-column:
 *   - Renders the agent conversation history with streaming
 *   - Renders the variable inputs (via SmartAgentInput)
 *   - Renders the message input + per-column Submit button
 *   - Self-binds to all per-instance slices via `conversationId`
 *
 * Per-column submit is therefore just whatever AgentConversationColumn
 * already exposes — no extra wiring needed. The page-level Submit All
 * fires `launchConversation` separately for every column.
 */

import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { BattleColumnHeader } from "./BattleColumnHeader";
import { BATTLE_SURFACE_KEY } from "../redux/thunks";
import type { BattleColumn as BattleColumnType } from "../types";

interface BattleColumnProps {
  column: BattleColumnType;
  onToggleCollapse: () => void;
}

export function BattleColumn({ column, onToggleCollapse }: BattleColumnProps) {
  return (
    <div className="h-full flex flex-col min-w-0 min-h-0 bg-background">
      <BattleColumnHeader
        column={column}
        onToggleCollapse={onToggleCollapse}
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        {column.agentId ? (
          <AgentConversationColumn
            conversationId={column.conversationId}
            surfaceKey={BATTLE_SURFACE_KEY}
            smartInputProps={{
              sendButtonVariant: "blue",
              showSubmitOnEnterToggle: false,
              compact: true,
            }}
          />
        ) : (
          <EmptyAgentState />
        )}
      </div>
    </div>
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
