"use client";

/**
 * SharedRunsWindow
 *
 * The single comparison surface for every per-run telemetry source — server
 * session stats, client metrics, model-context measurements. Renders one
 * comparison table per metric section (Summary, Tokens, Server timing,
 * Client timing, Operations, Model context, Payload, Event counts,
 * Records). Each section ships its own min/max highlights.
 */

import { useAppSelector } from "@/lib/redux/hooks";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { InfoHint } from "@/components/official/InfoHint";
import { selectActiveBattleColumns } from "../shared/activeBattleColumns";
import { RunsComparisonTable } from "./RunsComparisonTable";

interface SharedRunsWindowProps {
  id: string;
  onClose: () => void;
}

export function SharedRunsWindow({ id, onClose }: SharedRunsWindowProps) {
  const columns = useAppSelector(selectActiveBattleColumns);

  return (
    <WindowPanel
      id={id}
      title="Runs comparison"
      width={920}
      height={680}
      onClose={onClose}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      actionsRight={
        <span className="flex max-w-[300px] items-center gap-1 text-[11px] text-muted-foreground">
          <span className="truncate">
            Every per-run metric, side-by-side — streaming live.
          </span>
          <InfoHint text="Per-run metrics side by side, streaming live; model context fills in after the first turn." />
        </span>
      }
    >
      <div className="h-full flex flex-col">
        {columns.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
            {/* read-gate-exempt: battle columns are this session's local state (a failed saved-battle open is shown by BattleRouteNotice on the page), not a read */}
            No columns yet.
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <RunsComparisonTable />
          </div>
        )}
      </div>
    </WindowPanel>
  );
}
