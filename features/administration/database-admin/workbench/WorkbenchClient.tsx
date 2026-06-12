"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Database, Play, Plus, RefreshCw } from "lucide-react";
import { useQueryWorkbench } from "./hooks/useQueryWorkbench";
import { extractVariableNames } from "./utils/interpolate";
import { VariablesPanel } from "./VariablesPanel";
import { QueryBlock } from "./QueryBlock";
import { MergePanel } from "./MergePanel";

export function WorkbenchClient() {
  const wb = useQueryWorkbench();

  const variableUsage = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const block of wb.blocks) {
      const names = extractVariableNames(block.query);
      for (const n of names) counts[n] = (counts[n] ?? 0) + 1;
    }
    return counts;
  }, [wb.blocks]);

  const anyRunning = wb.totals.running > 0;

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-900">
      {/* Top toolbar */}
      <div className="flex-shrink-0 px-4 py-2 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 shrink-0">
          <Database className="h-4 w-4" />
          <span className="text-sm font-medium">SQL Workbench</span>
        </div>

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 shrink-0" />

        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 min-w-0 overflow-hidden">
          <span className="shrink-0">
            <span className="font-mono text-slate-700 dark:text-slate-300">
              {wb.blocks.length}
            </span>{" "}
            {wb.blocks.length === 1 ? "query" : "queries"}
          </span>
          {wb.totals.totalRows > 0 && (
            <span className="shrink-0">
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {wb.totals.totalRows.toLocaleString()}
              </span>{" "}
              rows
            </span>
          )}
          {wb.totals.succeeded > 0 && (
            <span className="shrink-0 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="font-mono">{wb.totals.succeeded}</span> ok
            </span>
          )}
          {wb.totals.failed > 0 && (
            <span className="shrink-0 flex items-center gap-1 text-red-600 dark:text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              <span className="font-mono">{wb.totals.failed}</span> failed
            </span>
          )}
          {wb.totals.running > 0 && (
            <span className="shrink-0 flex items-center gap-1 text-blue-600 dark:text-blue-400">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
              <span className="font-mono">{wb.totals.running}</span> running
            </span>
          )}
          {wb.totals.totalMs > 0 && (
            <span className="shrink-0 font-mono">
              {wb.totals.totalMs < 1000
                ? `${Math.round(wb.totals.totalMs)}ms`
                : `${(wb.totals.totalMs / 1000).toFixed(2)}s`}
            </span>
          )}
        </div>

        <div className="flex-1" />

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={wb.clearResults}
                className="h-7 text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Clear results
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                Reset all query results, keep the queries
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Button
          variant="outline"
          size="sm"
          onClick={wb.addBlock}
          className="h-7 text-xs"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add query
        </Button>

        <Button
          onClick={wb.runAll}
          disabled={anyRunning}
          size="sm"
          className="h-7 bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-800"
        >
          <Play className="h-3.5 w-3.5 mr-1" />
          Run all
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[280px_1fr] gap-3 p-3 overflow-hidden">
        {/* Sidebar */}
        <aside className="min-h-0 overflow-y-auto">
          <VariablesPanel
            variables={wb.variables}
            onAdd={wb.addVariable}
            onUpdate={wb.updateVariable}
            onRemove={wb.removeVariable}
            usageCounts={variableUsage}
          />
        </aside>

        {/* Main */}
        <main className="min-h-0 overflow-y-auto space-y-3">
          {wb.blocks.map((block, idx) => (
            <QueryBlock
              key={block.id}
              block={block}
              variables={wb.variables}
              index={idx}
              totalBlocks={wb.blocks.length}
              onUpdate={wb.updateBlock}
              onRun={wb.runBlock}
              onRemove={wb.removeBlock}
              onDuplicate={wb.duplicateBlock}
              onMove={wb.moveBlock}
            />
          ))}

          <Button
            variant="outline"
            onClick={wb.addBlock}
            className="w-full h-9 text-xs border-dashed border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add query
          </Button>

          <MergePanel
            blocks={wb.blocks}
            config={wb.mergeConfig}
            onChangeConfig={wb.setMergeField}
            result={wb.mergeResult}
            onResult={wb.setMergeResult}
          />

          {/* Scroll runway — lets the user pull the merge panel up to the
              middle of the viewport instead of getting stuck at the bottom
              edge while inspecting results. */}
          <div className="h-[60dvh] shrink-0" aria-hidden />
        </main>
      </div>
    </div>
  );
}
