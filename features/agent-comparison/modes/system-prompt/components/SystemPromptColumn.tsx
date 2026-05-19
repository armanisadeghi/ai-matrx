"use client";

/**
 * SystemPromptColumn
 *
 * Body splits vertically: top = the column's own system-prompt editor
 * (pointed at the column's synthetic agent record), bottom = the bound
 * conversation surface. The split is user-resizable so they can give
 * either half more room based on whether they're editing or comparing
 * responses.
 *
 * The editor is the existing builder `SystemMessage` component — we
 * "hijack" it the way the user described: pass the synthetic agent id
 * and let its existing dispatches write to
 * `agentDefinition.agents[syntheticId]`. Since manual-mode execution
 * reads the agent definition LIVE from that slice, the per-column
 * prompt flows into the per-column run with no special routing.
 */

import { ChevronsLeftRight } from "lucide-react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { SystemMessage } from "@/features/agents/components/builder/message-builders/system-instructions/SystemMessage";
import { BoundColumn } from "../../../shared/BoundColumn";
import { SystemPromptColumnHeader } from "./SystemPromptColumnHeader";
import { SYSTEM_PROMPT_SURFACE_KEY } from "../redux/thunks";
import type { SystemPromptColumn as SystemPromptColumnType } from "../types";

interface Props {
  column: SystemPromptColumnType;
  onToggleCollapse: () => void;
}

export function SystemPromptColumn({ column, onToggleCollapse }: Props) {
  if (column.collapsed) {
    return <CollapsedView column={column} onExpand={onToggleCollapse} />;
  }
  return (
    <div className="h-full flex flex-col min-w-0 min-h-0 bg-background">
      <SystemPromptColumnHeader
        column={column}
        onToggleCollapse={onToggleCollapse}
      />
      <div className="flex-1 min-h-0 min-w-0">
        <ResizablePanelGroup
          id={`sp-col-${column.columnId}`}
          orientation="vertical"
          className="h-full w-full"
        >
          <ResizablePanel
            id={`sp-editor-${column.columnId}`}
            defaultSize="45%"
            minSize="15%"
            style={{ overflow: "hidden" }}
          >
            <div className="h-full overflow-y-auto p-2">
              <SystemMessage agentId={column.syntheticAgentId} />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel
            id={`sp-body-${column.columnId}`}
            defaultSize="55%"
            minSize="15%"
            style={{ overflow: "hidden" }}
          >
            <div className="h-full overflow-hidden flex justify-center min-w-0">
              <BoundColumn
                conversationId={column.conversationId}
                surfaceKey={SYSTEM_PROMPT_SURFACE_KEY}
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
  column: SystemPromptColumnType;
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
