"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Variable as VariableIcon,
  Plus,
  Trash2,
  Info,
  Copy,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { Variable } from "./types";

interface VariablesPanelProps {
  variables: Variable[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<Variable>) => void;
  onRemove: (id: string) => void;
  usageCounts: Record<string, number>;
}

export function VariablesPanel({
  variables,
  onAdd,
  onUpdate,
  onRemove,
  usageCounts,
}: VariablesPanelProps) {
  const handleCopy = (token: string) => {
    navigator.clipboard.writeText(token);
    toast.success(`Copied ${token}`);
  };

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-200 min-w-0">
          <VariableIcon className="h-4 w-4 shrink-0" />
          <span>Variables</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 cursor-help shrink-0" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <div className="text-xs space-y-1">
                  <div>
                    <code className="font-mono">{"{{name}}"}</code> — raw text
                    substitution
                  </div>
                  <div>
                    <code className="font-mono">{"{{:name}}"}</code> —
                    auto-quoted SQL string (escapes <code>'</code>)
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Button
          onClick={onAdd}
          variant="outline"
          size="sm"
          className="h-7 text-xs border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
        >
          <Plus className="h-3 w-3 mr-1" />
          Add
        </Button>
      </div>

      <div className="p-2 space-y-2">
        {variables.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 italic px-1 py-2">
            No variables defined. Click Add to create one.
          </p>
        ) : (
          variables.map((v) => {
            const usage = v.name ? (usageCounts[v.name] ?? 0) : 0;
            const quotedToken = v.name ? `{{:${v.name}}}` : "";
            const rawToken = v.name ? `{{${v.name}}}` : "";
            return (
              <div
                key={v.id}
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-800/30 overflow-hidden"
              >
                <div className="p-2 space-y-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Input
                      placeholder="name"
                      value={v.name}
                      onChange={(e) => onUpdate(v.id, { name: e.target.value })}
                      className="h-7 text-xs font-mono bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 min-w-0 flex-1"
                    />
                    <Button
                      onClick={() => onRemove(v.id)}
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 shrink-0 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                      title="Remove variable"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Input
                    placeholder="value"
                    value={v.value}
                    onChange={(e) => onUpdate(v.id, { value: e.target.value })}
                    className="h-7 text-xs font-mono bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                  />
                </div>
                {v.name && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-slate-100/60 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-700 min-w-0">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => handleCopy(quotedToken)}
                            className={cn(
                              "flex items-center gap-1 min-w-0 flex-1",
                              "text-[10px] font-mono text-slate-600 dark:text-slate-300",
                              "hover:text-slate-900 dark:hover:text-slate-100",
                              "transition-colors group",
                            )}
                          >
                            <Copy className="h-2.5 w-2.5 shrink-0 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
                            <span className="truncate">{quotedToken}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <span className="text-xs">
                            Copy auto-quoted token
                          </span>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => handleCopy(rawToken)}
                            className="text-[10px] font-mono text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-1 shrink-0 transition-colors"
                          >
                            raw
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <span className="text-xs">
                            Copy raw token{" "}
                            <code className="font-mono">{rawToken}</code>
                          </span>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 tabular-nums">
                      {usage > 0 ? `· ${usage}` : ""}
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
