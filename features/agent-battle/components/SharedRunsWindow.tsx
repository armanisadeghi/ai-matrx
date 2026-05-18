"use client";

/**
 * SharedRunsWindow
 *
 * Floating window that shows one SessionStatsPanel per column side-by-side
 * so the user can compare token/cost/timing across every run at a glance.
 *
 * Pure read — no broadcast needed. Each SessionStatsPanel keys off its
 * own conversationId and reads from activeRequests.
 */

import { useAppSelector } from "@/lib/redux/hooks";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { SessionStatsPanel } from "@/features/agents/components/run-controls/panels/SessionStatsPanel";
import { selectAgentName } from "@/features/agents/redux/agent-definition/selectors";
import { selectBattleColumns } from "../redux/selectors";
import type { BattleColumn } from "../types";

interface SharedRunsWindowProps {
  id: string;
  onClose: () => void;
}

export function SharedRunsWindow({ id, onClose }: SharedRunsWindowProps) {
  const columns = useAppSelector(selectBattleColumns);

  return (
    <WindowPanel
      id={id}
      title="Runs (all columns)"
      width={680}
      height={520}
      onClose={onClose}
    >
      <div className="h-full flex flex-col">
        <div className="px-3 py-2 border-b border-border text-[11px] text-muted-foreground bg-muted/20">
          Live session stats for every configured column. Token counts and
          cost numbers are pulled live from each run — nothing is duplicated.
        </div>

        {columns.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
            No columns yet.
          </div>
        ) : (
          <div className="flex-1 overflow-auto divide-y divide-border">
            {columns.map((col) => (
              <ColumnRunSection key={col.columnId} column={col} />
            ))}
          </div>
        )}
      </div>
    </WindowPanel>
  );
}

function ColumnRunSection({ column }: { column: BattleColumn }) {
  const agentName = useAppSelector((s) =>
    column.agentId ? selectAgentName(s, column.agentId) : null,
  );
  const versionLabel =
    column.agentVersion == null
      ? ""
      : column.agentVersion === "current"
      ? "current"
      : `v${column.agentVersion}`;

  return (
    <div className="flex flex-col">
      <div className="px-3 py-1.5 bg-card/50 sticky top-0 z-10 border-b border-border/50 flex items-center gap-2">
        <span className="text-xs font-semibold truncate">
          {agentName ?? "Unconfigured column"}
        </span>
        {versionLabel && (
          <span className="text-[10px] font-mono text-muted-foreground">
            {versionLabel}
          </span>
        )}
      </div>
      {column.agentId ? (
        <SessionStatsPanel conversationId={column.conversationId} />
      ) : (
        <div className="px-3 py-2 text-[11px] text-muted-foreground">
          No agent selected.
        </div>
      )}
    </div>
  );
}
