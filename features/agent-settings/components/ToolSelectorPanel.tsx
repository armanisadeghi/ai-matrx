"use client";

import { Plus, X, AlertTriangle } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatText } from "@/utils/text/text-case-converter";
import { mapIcon } from "@/utils/icons/icon-mapper";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectEffectiveSettings,
  selectNormalizedControls,
} from "@/lib/redux/slices/agent-settings/selectors";
import { applySettingsFromDialog } from "@/lib/redux/slices/agent-settings/agentSettingsSlice";
import { supportsTools } from "@/features/agents/hooks/useModelControls";

interface AvailableTool {
  name: string;
  description?: string;
  category?: string;
  icon?: string;
}

interface ToolSelectorPanelProps {
  agentId: string;
  availableTools: AvailableTool[];
}

export function ToolSelectorPanel({
  agentId,
  availableTools,
}: ToolSelectorPanelProps) {
  const dispatch = useAppDispatch();
  const effectiveSettings = useAppSelector((state) =>
    selectEffectiveSettings(state, agentId),
  );
  const normalizedControls = useAppSelector((state) =>
    selectNormalizedControls(state, agentId),
  );

  const selectedTools: string[] = effectiveSettings.tools ?? [];
  // Canonical capability read — supported unless the model explicitly declares
  // tools:{allowed:false} (mirrors the server's permissive default).
  const modelSupportsTools = supportsTools(normalizedControls);

  const handleAddTool = (toolName: string) => {
    if (selectedTools.includes(toolName)) return;
    dispatch(
      applySettingsFromDialog({
        agentId,
        newSettings: {
          ...effectiveSettings,
          tools: [...selectedTools, toolName],
        },
      }),
    );
  };

  const handleRemoveTool = (toolName: string) => {
    dispatch(
      applySettingsFromDialog({
        agentId,
        newSettings: {
          ...effectiveSettings,
          tools: selectedTools.filter((t) => t !== toolName),
        },
      }),
    );
  };

  const unselectedTools = availableTools.filter(
    (t) => !selectedTools.includes(t.name),
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Tools
        </Label>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              disabled={!modelSupportsTools}
              title={
                modelSupportsTools
                  ? "Add tool"
                  : "This model does not support tools"
              }
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-56 p-1 max-h-60 overflow-y-auto"
          >
            {unselectedTools.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-1.5">
                All available tools are selected.
              </p>
            ) : (
              <div className="space-y-0.5">
                {unselectedTools.map((tool) => (
                  <button
                    key={tool.name}
                    type="button"
                    onClick={() => handleAddTool(tool.name)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-accent text-left transition-colors"
                  >
                    {mapIcon(tool.icon, tool.category, 14)}
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {formatText(tool.name)}
                      </div>
                      {tool.description && (
                        <div className="text-muted-foreground truncate text-[10px]">
                          {tool.description}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {/* Advisory — saved tools will be dropped at run time for this model.
          Non-blocking; the server enforces the drop. */}
      {!modelSupportsTools && selectedTools.length > 0 && (
        <div className="flex items-start gap-1.5 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
          <span className="text-[11px] leading-tight text-amber-700 dark:text-amber-300">
            This model doesn&apos;t support tools — the {selectedTools.length}{" "}
            selected tool{selectedTools.length === 1 ? "" : "s"} will be dropped
            at run time.
          </span>
        </div>
      )}

      {/* Inline explanation when the add affordance is disabled. */}
      {!modelSupportsTools && (
        <p className="text-[11px] italic text-muted-foreground">
          This model doesn&apos;t support tools.
        </p>
      )}

      {/* Selected tools */}
      {selectedTools.length === 0 ? (
        <p className="text-xs text-muted-foreground/60 italic">
          No tools selected
        </p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {selectedTools.map((toolName) => {
            const toolMeta = availableTools.find((t) => t.name === toolName);
            const isUnknown = !toolMeta;

            return (
              <div
                key={toolName}
                className="inline-flex items-center gap-1 h-6 px-1.5 rounded border border-border bg-muted/30 text-xs"
              >
                {toolMeta
                  ? mapIcon(toolMeta.icon, toolMeta.category, 12)
                  : null}
                <span className="max-w-24 truncate">
                  {formatText(toolName)}
                </span>
                {isUnknown && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">
                      Tool not found in available tools list
                    </TooltipContent>
                  </Tooltip>
                )}
                <button
                  type="button"
                  onClick={() => handleRemoveTool(toolName)}
                  className="ml-0.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
