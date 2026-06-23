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
        <span
          title="Every per-run metric, side-by-side. Values stream live from each column — nothing is duplicated. The Model Context section populates after the first turn of a conversation."
          className="max-w-[280px] truncate text-[11px] text-muted-foreground"
        >
          Every per-run metric, side-by-side — streaming live.
        </span>
      }
    >
      <div className="h-full flex flex-col">
        {columns.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
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
