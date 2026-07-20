"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Play,
  Trash2,
  Copy,
  ChevronDown,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Loader2,
  Eye,
  Files,
  AlertTriangle,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { interpolateQuery } from "./utils/interpolate";
import { ResultPreview } from "./ResultPreview";
import type { QueryBlockState, Variable } from "./types";

interface QueryBlockProps {
  block: QueryBlockState;
  variables: Variable[];
  index: number;
  totalBlocks: number;
  onUpdate: (id: string, patch: Partial<QueryBlockState>) => void;
  onRun: (id: string) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}

const STATUS_DOT_CLASS: Record<QueryBlockState["status"], string> = {
  idle: "bg-slate-300 dark:bg-slate-600",
  running: "bg-blue-500 animate-pulse",
  success: "bg-emerald-500",
  error: "bg-red-500",
};

const STATUS_LABEL: Record<QueryBlockState["status"], string> = {
  idle: "Idle",
  running: "Running",
  success: "Success",
  error: "Error",
};

function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function IconButton({
  icon: Icon,
  onClick,
  disabled,
  tooltip,
  destructive,
}: {
  icon: typeof Trash2;
  onClick: () => void;
  disabled?: boolean;
  tooltip: string;
  destructive?: boolean;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClick}
            disabled={disabled}
            className={cn(
              "h-7 w-7 p-0 shrink-0",
              destructive
                ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <span className="text-xs">{tooltip}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function QueryBlock({
  block,
  variables,
  index,
  totalBlocks,
  onUpdate,
  onRun,
  onRemove,
  onDuplicate,
  onMove,
}: QueryBlockProps) {
  const [resultExpanded, setResultExpanded] = useState(true);
  const [showResolved, setShowResolved] = useState(false);

  const interpolation = useMemo(
    () => interpolateQuery(block.query, variables),
    [block.query, variables],
  );

  const hasMissing = interpolation.missing.length > 0;
  const hasUsed = interpolation.used.length > 0;
  const hasWarnings = interpolation.warnings.length > 0;
  const isRunning = block.status === "running";
  const hasMeta =
    block.status !== "idle" || hasUsed || hasMissing || hasWarnings;

  const copyResolved = () => {
    if (!interpolation.resolved) return;
    navigator.clipboard.writeText(interpolation.resolved);
    toast.success("Copied resolved query");
  };

  const displayQuery = showResolved ? interpolation.resolved : block.query;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
      {/* Header: status dot + name + actions */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 min-w-0">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "h-2 w-2 rounded-full shrink-0",
                  STATUS_DOT_CLASS[block.status],
                )}
                aria-label={STATUS_LABEL[block.status]}
              />
            </TooltipTrigger>
            <TooltipContent>
              <span className="text-xs">{STATUS_LABEL[block.status]}</span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 shrink-0">
          #{index + 1}
        </span>

        <Input
          value={block.label}
          onChange={(e) => onUpdate(block.id, { label: e.target.value })}
          className="h-7 text-sm font-medium border-transparent shadow-none bg-transparent focus-visible:ring-1 focus-visible:ring-slate-300 dark:focus-visible:ring-slate-600 px-2 min-w-0 flex-1"
          placeholder="Query name"
        />

        <div className="flex items-center gap-0.5 shrink-0">
          <IconButton
            icon={ArrowUp}
            onClick={() => onMove(block.id, -1)}
            disabled={index === 0}
            tooltip="Move up"
          />
          <IconButton
            icon={ArrowDown}
            onClick={() => onMove(block.id, 1)}
            disabled={index === totalBlocks - 1}
            tooltip="Move down"
          />
          <IconButton
            icon={Files}
            onClick={() => onDuplicate(block.id)}
            tooltip="Duplicate"
          />
          <IconButton
            icon={Trash2}
            onClick={() => onRemove(block.id)}
            disabled={totalBlocks <= 1}
            tooltip="Remove"
            destructive
          />
          <Button
            onClick={() => onRun(block.id)}
            disabled={isRunning || !block.query.trim()}
            size="sm"
            className="h-7 ml-1 bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-800 shrink-0"
          >
            {isRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            <span className="ml-1 text-xs">Run</span>
          </Button>
        </div>
      </div>

      {/* Query editor */}
      <div className="relative">
        <textarea
          value={displayQuery ?? ""}
          onChange={(e) => onUpdate(block.id, { query: e.target.value })}
          readOnly={showResolved}
          className={cn(
            "w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-0 resize-y focus:outline-none focus:ring-0 min-h-[80px]",
            showResolved && "bg-slate-50 dark:bg-slate-800/50",
          )}
          placeholder="-- Enter SQL. Use {{variable}} for raw substitution, {{:variable}} for auto-quoted strings."
          spellCheck={false}
        />
        {hasUsed && (
          <div className="absolute bottom-2 right-2 flex gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowResolved((s) => !s)}
                    className="h-6 px-2 text-[10px] bg-white/90 dark:bg-slate-900/90 border-slate-200 dark:border-slate-700 backdrop-blur"
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    {showResolved ? "Edit" : "Preview"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <span className="text-xs">
                    {showResolved
                      ? "Switch back to edit"
                      : "Show resolved query with variables substituted"}
                  </span>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {showResolved && (
              <Button
                variant="outline"
                size="sm"
                onClick={copyResolved}
                className="h-6 w-6 p-0 bg-white/90 dark:bg-slate-900/90 border-slate-200 dark:border-slate-700 backdrop-blur"
                title="Copy resolved"
              >
                <Copy className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Meta strip: row count, time, vars used, missing */}
      {hasMeta && (
        <div className="flex flex-col gap-0.5 px-3 py-1 bg-slate-50/60 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 dark:text-slate-400 min-w-0">
          <div className="flex items-center gap-3 min-w-0 overflow-x-auto">
            {block.status === "success" && block.rowCount !== null && (
              <span className="font-mono shrink-0">
                <span className="text-slate-700 dark:text-slate-300">
                  {block.rowCount.toLocaleString()}
                </span>{" "}
                {block.rowCount === 1 ? "row" : "rows"}
              </span>
            )}
            {block.executionTime !== null && (
              <span className="font-mono shrink-0">
                {formatMs(block.executionTime)}
              </span>
            )}
            {block.status === "error" && (
              <span className="text-red-600 dark:text-red-400 shrink-0">
                Failed
              </span>
            )}
            {hasUsed && (
              <span className="truncate min-w-0">
                uses{" "}
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  {interpolation.used.join(", ")}
                </span>
              </span>
            )}
            {hasMissing && (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 shrink-0">
                <AlertTriangle className="h-3 w-3" />
                missing{" "}
                <span className="font-mono">
                  {interpolation.missing.join(", ")}
                </span>
              </span>
            )}
          </div>
          {hasWarnings &&
            interpolation.warnings.map((w) => (
              <div
                key={`${w.type}-${w.variable}`}
                className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400 min-w-0"
              >
                <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                <span className="break-words">{w.message}</span>
              </div>
            ))}
        </div>
      )}

      {/* Error display */}
      {block.status === "error" && block.error && (
        <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-900">
          <pre className="text-xs font-mono text-red-700 dark:text-red-400 whitespace-pre-wrap break-words">
            {block.error}
          </pre>
        </div>
      )}

      {/* Result display */}
      {block.status === "success" && (
        <div className="border-t border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setResultExpanded((s) => !s)}
            className="w-full flex items-center gap-1 px-3 py-1 text-[11px] text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40"
          >
            {resultExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Result
          </button>
          {resultExpanded && (
            <div className="max-h-[420px] flex flex-col overflow-hidden border-t border-slate-100 dark:border-slate-800">
              <ResultPreview data={block.result} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
