"use client";

/**
 * TuningColumn
 *
 * Body splits vertically: top = the column's tuning summary (model +
 * inline settings pills + Edit button that opens the Builder
 * AgentSettingsModal), bottom = the bound conversation surface.
 */

import { ChevronsLeftRight } from "lucide-react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { BoundColumn } from "../../../shared/BoundColumn";
import { BlindColumnHeader } from "../../../shared/BlindColumnHeader";
import { selectBlindActive } from "../../../redux/selectors";
import { TuningColumnHeader } from "./TuningColumnHeader";
import { TuningSummaryPanel } from "./TuningSummaryPanel";
import {
  TUNING_SURFACE_KEY,
  removeColumnFromTuningBattle,
} from "../redux/thunks";
import type { TuningColumn as TuningColumnType } from "../types";

interface Props {
  column: TuningColumnType;
  onToggleCollapse: () => void;
}

export function TuningColumn({ column, onToggleCollapse }: Props) {
  const dispatch = useAppDispatch();
  const blindActive = useAppSelector(selectBlindActive);

  if (column.collapsed) {
    return <CollapsedView column={column} onExpand={onToggleCollapse} />;
  }

  // Blind test: model + settings ARE the varied axis — hide the tuning
  // panel, show only the response under a neutral anon header.
  if (blindActive) {
    return (
      <div className="h-full flex flex-col min-w-0 min-h-0 bg-background">
        <BlindColumnHeader
          columnId={column.columnId}
          collapsed={column.collapsed}
          onToggleCollapse={onToggleCollapse}
          onRemove={() =>
            dispatch(
              removeColumnFromTuningBattle({ columnId: column.columnId }),
            )
          }
        />
        <div className="flex-1 overflow-hidden flex justify-center min-w-0">
          <BoundColumn
            conversationId={column.conversationId}
            surfaceKey={TUNING_SURFACE_KEY}
            hideInput
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-w-0 min-h-0 bg-background">
      <TuningColumnHeader
        column={column}
        onToggleCollapse={onToggleCollapse}
      />
      <div className="flex-1 min-h-0 min-w-0">
        <ResizablePanelGroup
          id={`tn-col-${column.columnId}`}
          orientation="vertical"
          className="h-full w-full"
        >
          <ResizablePanel
            id={`tn-tuning-${column.columnId}`}
            defaultSize="25%"
            minSize="10%"
            style={{ overflow: "hidden" }}
          >
            <TuningSummaryPanel syntheticAgentId={column.syntheticAgentId} />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel
            id={`tn-body-${column.columnId}`}
            defaultSize="75%"
            minSize="15%"
            style={{ overflow: "hidden" }}
          >
            <div className="h-full overflow-hidden flex justify-center min-w-0">
              <BoundColumn
                conversationId={column.conversationId}
                surfaceKey={TUNING_SURFACE_KEY}
                hideInput
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

function CollapsedView({
  column,
  onExpand,
}: {
  column: TuningColumnType;
  onExpand: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onExpand}
      title={`Expand "${column.label}"`}
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
        <span className="text-[11px] font-semibold uppercase tracking-wider truncate max-h-full [writing-mode:vertical-rl] rotate-180 text-primary">
          {column.label}
        </span>
      </div>
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
        collapsed
      </span>
    </button>
  );
}
