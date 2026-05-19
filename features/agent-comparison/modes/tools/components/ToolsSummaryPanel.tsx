"use client";

/**
 * ToolsSummaryPanel
 *
 * Inline summary of the column's currently-attached tools, so the
 * user can scan-compare what each variant has without opening the
 * full picker. Includes an "Edit tools" button that opens the same
 * `AgentToolsModal` the Agent Builder uses — pointed at the column's
 * synthetic agent record.
 *
 * Tools = built-in tool ids resolved against the tools registry;
 * customTools / mcpServers render as plain badges with their id (the
 * full pickers + resolvers live inside the modal anyway).
 */

import { useEffect } from "react";
import { Wrench, Server, Code2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentTools,
  selectAgentCustomTools,
  selectAgentMcpServers,
} from "@/features/agents/redux/agent-definition/selectors";
import {
  selectAllTools,
  selectToolsReady,
} from "@/features/agents/redux/tools/tools.selectors";
import { fetchAvailableTools } from "@/features/agents/redux/tools/tools.thunks";
import { AgentToolsModal } from "@/features/agents/components/tools-management/AgentToolsModal";

interface Props {
  syntheticAgentId: string;
}

export function ToolsSummaryPanel({ syntheticAgentId }: Props) {
  const dispatch = useAppDispatch();

  const tools = useAppSelector((s) =>
    selectAgentTools(s, syntheticAgentId),
  );
  const customTools = useAppSelector((s) =>
    selectAgentCustomTools(s, syntheticAgentId),
  );
  const mcpServers = useAppSelector((s) =>
    selectAgentMcpServers(s, syntheticAgentId),
  );

  const toolsReady = useAppSelector(selectToolsReady);
  const allTools = useAppSelector(selectAllTools);

  // The modal lazy-loads the tools list when it opens, but the
  // summary needs it eagerly so we can resolve ids → names.
  useEffect(() => {
    if (!toolsReady) {
      dispatch(fetchAvailableTools());
    }
  }, [toolsReady, dispatch]);

  const toolMap = new Map(allTools.map((t) => [t.id, t]));

  const toolIds = Array.isArray(tools) ? tools : [];
  const customIds = Array.isArray(customTools) ? customTools : [];
  const mcpIds = Array.isArray(mcpServers) ? mcpServers : [];

  const totalCount = toolIds.length + customIds.length + mcpIds.length;

  return (
    <div className="h-full overflow-y-auto p-2 space-y-2">
      <div className="flex items-center justify-between sticky top-0 bg-background py-1">
        <div className="flex items-center gap-1.5">
          <Wrench className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Tools
          </span>
          <span className="text-[10px] text-muted-foreground/70">
            ({totalCount} attached)
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <AgentToolsModal agentId={syntheticAgentId} />
        </div>
      </div>

      {totalCount === 0 ? (
        <EmptyHint />
      ) : (
        <div className="space-y-2">
          {toolIds.length > 0 && (
            <SectionList
              icon={<Wrench className="w-3 h-3" />}
              title="Built-in"
              items={toolIds.map((id) => {
                const t = toolMap.get(id);
                return {
                  id,
                  label: t?.name ?? id,
                  sub: t?.category ?? undefined,
                };
              })}
            />
          )}
          {customIds.length > 0 && (
            <SectionList
              icon={<Code2 className="w-3 h-3" />}
              title="Custom"
              items={customIds.map((t) => ({
                id: t.name,
                label: t.name,
                sub: t.description,
              }))}
            />
          )}
          {mcpIds.length > 0 && (
            <SectionList
              icon={<Server className="w-3 h-3" />}
              title="MCP"
              items={mcpIds.map((id) => ({ id, label: id }))}
            />
          )}
        </div>
      )}
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="text-center py-6 px-2">
      <div className="text-[11px] text-muted-foreground">
        No tools attached yet.
      </div>
      <div className="text-[10px] text-muted-foreground/70 mt-1">
        Click the wrench above to pick tools for this variant.
      </div>
    </div>
  );
}

function SectionList({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: Array<{ id: string; label: string; sub?: string }>;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {icon}
        {title}
        <span className="text-muted-foreground/60">· {items.length}</span>
      </div>
      <div className="space-y-0.5">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-baseline gap-1.5 px-1.5 py-0.5 rounded text-[11px] bg-muted/40"
          >
            <span className="font-medium text-foreground truncate flex-1 min-w-0">
              {item.label}
            </span>
            {item.sub && (
              <span className="text-[9px] text-muted-foreground/70 shrink-0">
                {item.sub}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
