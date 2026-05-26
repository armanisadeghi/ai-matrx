'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Play,
  Square,
  RotateCcw,
  Tag,
  Wrench,
  Info,
} from 'lucide-react';
import { ArgumentForm, buildDefaults } from './ArgumentForm';
import type { ToolDefinition, ExecutionStatus, ParameterDefinition } from '@/features/tool-call-visualization/testing/types';

interface ToolConfigPanelProps {
  tool: ToolDefinition | null;
  argValues: Record<string, unknown>;
  onArgValuesChange: (values: Record<string, unknown>) => void;
  executionStatus: ExecutionStatus;
  onExecute: () => void;
  onCancel: () => void;
  onReset: () => void;
  serverInfo?: { type: string; baseUrl: string };
  /** Whether a real conversation is set — required before execution */
  conversationReady?: boolean;
}

export function ToolConfigPanel({
  tool,
  argValues,
  onArgValuesChange,
  executionStatus,
  onExecute,
  onCancel,
  onReset,
  serverInfo,
  conversationReady = true,
}: ToolConfigPanelProps) {
  const isRunning = executionStatus === 'running' || executionStatus === 'connecting';

  if (!tool) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3 px-4">
        <Wrench className="h-8 w-8 opacity-40" />
        <p className="text-sm">Select a tool from the sidebar to begin testing</p>
      </div>
    );
  }

  const hasRequired = Object.values(tool.parameters).some((p) => p.required);
  const requiredFilled = Object.entries(tool.parameters).every(([name, p]) => {
    if (!p.required) return true;
    const val = argValues[name];
    if (val === undefined || val === null || val === '') return false;
    if (Array.isArray(val) && val.length === 0 && p.minItems && p.minItems > 0) return false;
    return true;
  });

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Tool header */}
      <div className="flex-shrink-0 p-3 border-b space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold truncate">{tool.name}</h2>
          </div>
          {tool.version && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0">
              v{tool.version}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {tool.category && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {tool.category}
            </Badge>
          )}
          {tool.tags?.map((tag) => (
            <Badge key={tag} variant="outline" className="text-[10px] px-1 py-0 font-normal">
              <Tag className="h-2.5 w-2.5 mr-0.5" />
              {tag}
            </Badge>
          ))}
          {tool.output_schema ? (
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal text-success">
                  <Info className="h-2.5 w-2.5 mr-0.5" />
                  schema
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Has registered output schema</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal text-muted-foreground">
                  <Info className="h-2.5 w-2.5 mr-0.5" />
                  no schema
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="text-xs">No output schema registered</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Arguments form — scrollable */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold">Arguments</span>
            <span className="text-[10px] text-muted-foreground">
              {Object.keys(tool.parameters).length} parameter
              {Object.keys(tool.parameters).length !== 1 ? 's' : ''}
            </span>
          </div>
          <ArgumentForm
            parameters={tool.parameters}
            values={argValues}
            onChange={onArgValuesChange}
          />
        </div>
      </ScrollArea>

      {/* Execute / Cancel / Reset */}
      <div className="flex-shrink-0 p-3 border-t space-y-2">
        {serverInfo && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
            <span className={`inline-block h-1.5 w-1.5 rounded-full flex-shrink-0 ${serverInfo.type === 'local' ? 'bg-success' : 'bg-primary'}`} />
            <span className="truncate" title={serverInfo.baseUrl}>
              {serverInfo.type === 'local' ? 'localhost' : 'production'}: {serverInfo.baseUrl}
            </span>
          </div>
        )}
        {!conversationReady && (
          <p className="text-[10px] text-warning text-center">
            Set a conversation ID above before executing
          </p>
        )}
        {conversationReady && hasRequired && !requiredFilled && (
          <p className="text-[10px] text-warning text-center">
            Fill in required fields (*) before executing
          </p>
        )}
        <div className="flex gap-2">
          {isRunning ? (
            <Button
              onClick={onCancel}
              variant="destructive"
              size="sm"
              className="flex-1"
            >
              <Square className="h-3.5 w-3.5 mr-1.5" />
              Cancel
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex-1">
                  <Button
                    onClick={onExecute}
                    disabled={!requiredFilled || !conversationReady}
                    size="sm"
                    className="w-full"
                  >
                    <Play className="h-3.5 w-3.5 mr-1.5" />
                    Execute
                  </Button>
                </span>
              </TooltipTrigger>
              {!conversationReady && (
                <TooltipContent className="text-xs max-w-[200px]">
                  Set a real conversation ID in the header before executing
                </TooltipContent>
              )}
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={onReset}
                variant="outline"
                size="sm"
                className="px-2"
                disabled={isRunning}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Reset to defaults</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
