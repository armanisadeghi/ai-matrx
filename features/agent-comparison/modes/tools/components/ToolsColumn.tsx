"use client";

/**
 * ToolsColumn
 *
 * Body splits vertically: top = the column's tool summary + Edit
 * button (opens AgentToolsModal pointed at the synthetic agent),
 * bottom = the bound conversation surface. The split is resizable so
 * the user can give either half more room.
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
import { ToolsColumnHeader } from "./ToolsColumnHeader";
import { ToolsSummaryPanel } from "./ToolsSummaryPanel";
import {
  TOOLS_SURFACE_KEY,
  removeColumnFromToolsBattle,
} from "../redux/thunks";
import type { ToolsColumn as ToolsColumnType } from "../types";

interface Props {
  column: ToolsColumnType;
  onToggleCollapse: () => void;
}

export function ToolsColumn({ column, onToggleCollapse }: Props) {
  const dispatch = useAppDispatch();
  const blindActive = useAppSelector(selectBlindActive);

  if (column.collapsed) {
    return <CollapsedView column={column} onExpand={onToggleCollapse} />;
  }

  // Blind test: the tools list IS the varied axis — hide it, show only
  // the response under a neutral anon header.
  if (blindActive) {
    return (
      <div className="h-full flex flex-col min-w-0 min-h-0 bg-background">
        <BlindColumnHeader
          columnId={column.columnId}
          collapsed={column.collapsed}
          onToggleCollapse={onToggleCollapse}
          onRemove={() =>
            dispatch(
              removeColumnFromToolsBattle({ columnId: column.columnId }),
            )
          }
        />
        <div className="flex-1 overflow-hidden flex justify-center min-w-0">
          <BoundColumn
            conversationId={column.conversationId}
            surfaceKey={TOOLS_SURFACE_KEY}
            hideInput
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-w-0 min-h-0 bg-background">
      <ToolsColumnHeader
        column={column}
        onToggleCollapse={onToggleCollapse}
      />
      <div className="flex-1 min-h-0 min-w-0">
        <ResizablePanelGroup
          id={`tl-col-${column.columnId}`}
          orientation="vertical"
          className="h-full w-full"
        >
          <ResizablePanel
            id={`tl-tools-${column.columnId}`}
            defaultSize="35%"
            minSize="12%"
            style={{ overflow: "hidden" }}
          >
            <ToolsSummaryPanel syntheticAgentId={column.syntheticAgentId} />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel
            id={`tl-body-${column.columnId}`}
            defaultSize="65%"
            minSize="15%"
            style={{ overflow: "hidden" }}
          >
            <div className="h-full overflow-hidden flex justify-center min-w-0">
              <BoundColumn
                conversationId={column.conversationId}
                surfaceKey={TOOLS_SURFACE_KEY}
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
  column: ToolsColumnType;
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
