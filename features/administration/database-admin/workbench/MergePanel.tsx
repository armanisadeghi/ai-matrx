"use client";

import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { GitMerge, Rainbow, Info, AlertTriangle, Check } from "lucide-react";
import { toast } from "@/lib/toast";
import { ResultPreview } from "./ResultPreview";
import {
  deriveEmbedKey,
  getColumns,
  mergeResults,
  suggestJoinKeys,
  toRows,
  type JoinKeySuggestion,
} from "./utils/joinResults";
import type {
  JoinMode,
  MergeConfig,
  MergeResult,
  QueryBlockState,
} from "./types";

interface MergePanelProps {
  blocks: QueryBlockState[];
  config: MergeConfig;
  onChangeConfig: <K extends keyof MergeConfig>(
    key: K,
    value: MergeConfig[K],
  ) => void;
  result: MergeResult | null;
  onResult: (next: MergeResult | null) => void;
}

const MODE_DESCRIPTIONS: Record<JoinMode, string> = {
  concat:
    "Append rows from both queries with a `_source` field. Best for stacking unrelated rows.",
  inner:
    "Keep only rows where the join key matches in both. Columns are prefixed with the source label.",
  left: "Keep all rows from the left query. Attach matching right rows with the source-label prefix.",
  embed:
    "Keep all left rows. Nest matching right rows as a single object under a key derived from the right label (e.g. tool_calls). Best for hierarchical output.",
  timeline:
    "Concat both queries and sort by a shared timestamp column. Great for interleaving events.",
};

export function MergePanel({
  blocks,
  config,
  onChangeConfig,
  result,
  onResult,
}: MergePanelProps) {
  const successfulBlocks = useMemo(
    () => blocks.filter((b) => b.status === "success"),
    [blocks],
  );

  const leftBlock = useMemo(
    () => successfulBlocks.find((b) => b.id === config.leftBlockId) ?? null,
    [successfulBlocks, config.leftBlockId],
  );
  const rightBlock = useMemo(
    () => successfulBlocks.find((b) => b.id === config.rightBlockId) ?? null,
    [successfulBlocks, config.rightBlockId],
  );

  const leftRows = useMemo(
    () => (leftBlock ? toRows(leftBlock.result) : []),
    [leftBlock],
  );
  const rightRows = useMemo(
    () => (rightBlock ? toRows(rightBlock.result) : []),
    [rightBlock],
  );
  const leftCols = useMemo(() => getColumns(leftRows), [leftRows]);
  const rightCols = useMemo(() => getColumns(rightRows), [rightRows]);
  const suggestions = useMemo<JoinKeySuggestion[]>(
    () => suggestJoinKeys(leftRows, rightRows),
    [leftRows, rightRows],
  );

  const topSuggestion = suggestions[0] ?? null;

  // Auto-pick first two successful blocks if none chosen
  useEffect(() => {
    if (successfulBlocks.length >= 2) {
      if (!config.leftBlockId) {
        onChangeConfig("leftBlockId", successfulBlocks[0].id);
      }
      if (!config.rightBlockId) {
        const fallback = successfulBlocks.find(
          (b) => b.id !== successfulBlocks[0].id,
        );
        if (fallback) onChangeConfig("rightBlockId", fallback.id);
      }
    }
  }, [
    successfulBlocks,
    config.leftBlockId,
    config.rightBlockId,
    onChangeConfig,
  ]);

  // Auto-pick a join key pair when sources change
  useEffect(() => {
    if (
      (config.mode === "inner" ||
        config.mode === "left" ||
        config.mode === "embed") &&
      topSuggestion
    ) {
      if (!config.leftKey) onChangeConfig("leftKey", topSuggestion.leftKey);
      if (!config.rightKey) onChangeConfig("rightKey", topSuggestion.rightKey);
    }
  }, [
    topSuggestion,
    config.mode,
    config.leftKey,
    config.rightKey,
    onChangeConfig,
  ]);

  const requiresKeys =
    config.mode === "inner" ||
    config.mode === "left" ||
    config.mode === "embed";
  const canMerge =
    !!leftBlock &&
    !!rightBlock &&
    leftBlock.id !== rightBlock.id &&
    (!requiresKeys || (!!config.leftKey && !!config.rightKey));

  const applySuggestion = (s: JoinKeySuggestion) => {
    onChangeConfig("leftKey", s.leftKey);
    onChangeConfig("rightKey", s.rightKey);
  };

  const leftHint = useMemo(() => {
    if (!leftBlock) return null;
    if (config.mode === "embed") return `Output keeps left rows as-is`;
    if (config.mode === "concat" || config.mode === "timeline")
      return `Tagged with _source: "${leftBlock.label}"`;
    return `Columns prefixed with "${leftBlock.label}."`;
  }, [leftBlock, config.mode]);

  const rightHint = useMemo(() => {
    if (!rightBlock) return null;
    if (config.mode === "embed")
      return `Nested under "${deriveEmbedKey(rightBlock.label)}"`;
    if (config.mode === "concat" || config.mode === "timeline")
      return `Tagged with _source: "${rightBlock.label}"`;
    return `Columns prefixed with "${rightBlock.label}."`;
  }, [rightBlock, config.mode]);

  const handleMerge = () => {
    if (!leftBlock || !rightBlock) {
      toast.error("Pick two successful queries first");
      return;
    }
    if (leftBlock.id === rightBlock.id) {
      toast.error("Pick two different queries");
      return;
    }
    if (requiresKeys && (!config.leftKey || !config.rightKey)) {
      toast.error("Pick a join key for both sides");
      return;
    }

    const merged = mergeResults({
      leftRows,
      rightRows,
      leftLabel: leftBlock.label || "left",
      rightLabel: rightBlock.label || "right",
      leftKey: config.leftKey,
      rightKey: config.rightKey,
      mode: config.mode,
      timelineKey: config.timelineKey || "created_at",
    });

    onResult({
      rows: merged.rows,
      stats: merged.stats,
      generatedAt: Date.now(),
      config: { ...config },
    });

    if (merged.rows.length === 0) {
      toast.warning("Merge produced 0 rows — see diagnostics below");
    } else {
      toast.success(`Merged ${merged.rows.length} rows`);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200">
          <GitMerge className="h-4 w-4" />
          Merge Results
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <div className="text-xs">
                  Combine two successful query results into one. Pick the two
                  queries, choose a mode, and (for joins) pick the matching key
                  on each side.
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
          {successfulBlocks.length} ready
        </span>
      </div>

      <div className="p-3 space-y-3">
        {successfulBlocks.length < 2 ? (
          <div className="text-xs text-slate-500 dark:text-slate-400 italic px-1 py-2">
            Run at least two queries successfully to merge results.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Left source */}
              <div className="space-y-2">
                <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                  Left Source
                </label>
                <Select
                  value={config.leftBlockId ?? ""}
                  onValueChange={(v) => {
                    onChangeConfig("leftBlockId", v);
                    onChangeConfig("leftKey", null);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Pick a query" />
                  </SelectTrigger>
                  <SelectContent>
                    {successfulBlocks.map((b) => (
                      <SelectItem key={b.id} value={b.id} className="text-xs">
                        {b.label} ({b.rowCount} rows)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {requiresKeys && leftBlock && (
                  <Select
                    value={config.leftKey ?? ""}
                    onValueChange={(v) => onChangeConfig("leftKey", v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Join key" />
                    </SelectTrigger>
                    <SelectContent>
                      {leftCols.map((col) => (
                        <SelectItem key={col} value={col} className="text-xs">
                          <span className="font-mono">{col}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {leftHint && (
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                    {leftHint}
                  </div>
                )}
              </div>

              {/* Right source */}
              <div className="space-y-2">
                <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                  Right Source
                </label>
                <Select
                  value={config.rightBlockId ?? ""}
                  onValueChange={(v) => {
                    onChangeConfig("rightBlockId", v);
                    onChangeConfig("rightKey", null);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Pick a query" />
                  </SelectTrigger>
                  <SelectContent>
                    {successfulBlocks.map((b) => (
                      <SelectItem key={b.id} value={b.id} className="text-xs">
                        {b.label} ({b.rowCount} rows)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {requiresKeys && rightBlock && (
                  <Select
                    value={config.rightKey ?? ""}
                    onValueChange={(v) => onChangeConfig("rightKey", v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Join key" />
                    </SelectTrigger>
                    <SelectContent>
                      {rightCols.map((col) => (
                        <SelectItem key={col} value={col} className="text-xs">
                          <span className="font-mono">{col}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {rightHint && (
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                    {rightHint}
                  </div>
                )}
              </div>
            </div>

            {/* Mode buttons */}
            <div>
              <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide block mb-1.5">
                Mode
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
                {(
                  ["concat", "inner", "left", "embed", "timeline"] as JoinMode[]
                ).map((mode) => (
                  <TooltipProvider key={mode}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => onChangeConfig("mode", mode)}
                          className={`px-2 py-1.5 text-xs rounded-md border transition-colors capitalize ${
                            config.mode === mode
                              ? "bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-medium"
                              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                          }`}
                        >
                          {mode === "inner"
                            ? "Inner Join"
                            : mode === "left"
                              ? "Left Join"
                              : mode}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <div className="text-xs">{MODE_DESCRIPTIONS[mode]}</div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
            </div>

            {/* Timeline key */}
            {config.mode === "timeline" && (
              <div>
                <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide block mb-1">
                  Timestamp column
                </label>
                <Input
                  value={config.timelineKey}
                  onChange={(e) =>
                    onChangeConfig("timelineKey", e.target.value)
                  }
                  placeholder="created_at"
                  className="h-8 text-xs font-mono"
                />
              </div>
            )}

            {/* Suggested key pairs */}
            {requiresKeys && suggestions.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  <Rainbow className="h-3 w-3 text-amber-500" />
                  Suggested keys
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((s) => {
                    const isActive =
                      config.leftKey === s.leftKey &&
                      config.rightKey === s.rightKey;
                    const isSameName = s.leftKey === s.rightKey;
                    const label = isSameName
                      ? s.leftKey
                      : `${s.leftKey} ↔ ${s.rightKey}`;
                    const tooltipLines = [s.reason];
                    if (s.observedMatches !== null) {
                      tooltipLines.push(
                        s.observedMatches === 0
                          ? "No overlapping values found in sample."
                          : `${s.observedMatches} sample value${s.observedMatches === 1 ? "" : "s"} match.`,
                      );
                    }
                    return (
                      <TooltipProvider key={`${s.leftKey}::${s.rightKey}`}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => applySuggestion(s)}
                              className={`flex items-center gap-1 px-2 py-1 text-[10px] font-mono rounded-md border transition-colors ${
                                isActive
                                  ? "bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
                                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                              }`}
                            >
                              {isActive && <Check className="h-2.5 w-2.5" />}
                              {label}
                              {s.observedMatches !== null &&
                                s.observedMatches > 0 && (
                                  <span className="text-emerald-600 dark:text-emerald-400 font-sans">
                                    ✓{s.observedMatches}
                                  </span>
                                )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs">
                              {tooltipLines.map((line, i) => (
                                <div key={i}>{line}</div>
                              ))}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </div>
              </div>
            )}

            {requiresKeys && suggestions.length === 0 && (
              <div className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                <span>
                  No automatic key match found. Pick keys manually using the
                  dropdowns above — try columns ending in <code>_id</code>.
                </span>
              </div>
            )}

            <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-700">
              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                {leftBlock && rightBlock && (
                  <>
                    <span className="font-medium">{leftBlock.label}</span> (
                    {leftRows.length}) <span className="text-slate-400">×</span>{" "}
                    <span className="font-medium">{rightBlock.label}</span> (
                    {rightRows.length})
                  </>
                )}
              </div>
              <Button
                onClick={handleMerge}
                disabled={!canMerge}
                size="sm"
                className="h-7 bg-purple-600 hover:bg-purple-700 text-white dark:bg-purple-700 dark:hover:bg-purple-800"
              >
                <GitMerge className="h-3.5 w-3.5 mr-1" />
                Merge
              </Button>
            </div>
          </>
        )}

        {result && (
          <div className="border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden">
            <div className="flex items-center justify-between px-2 py-1 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300 min-w-0">
                <span className="font-medium shrink-0">Merged result</span>
                <span className="text-slate-500 dark:text-slate-400 capitalize shrink-0">
                  {result.config.mode}
                </span>
                <span className="text-slate-500 dark:text-slate-400 font-mono shrink-0">
                  · {result.rows.length.toLocaleString()} rows
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onResult(null)}
                className="h-6 px-2 text-[10px] text-slate-500 dark:text-slate-400"
              >
                Clear
              </Button>
            </div>
            {/* Diagnostics strip */}
            <div className="flex flex-col gap-0.5 px-2 py-1 bg-slate-50/40 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-700 text-[10px] text-slate-500 dark:text-slate-400">
              {(result.config.mode === "inner" ||
                result.config.mode === "left" ||
                result.config.mode === "embed") && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {result.stats.matchedLeft.toLocaleString()}
                    </span>
                    /
                    <span className="font-mono">
                      {result.stats.leftRows.toLocaleString()}
                    </span>{" "}
                    left rows matched
                  </span>
                  {result.stats.unmatchedLeft > 0 && (
                    <span className="text-amber-700 dark:text-amber-400">
                      {result.stats.unmatchedLeft.toLocaleString()} unmatched
                      left
                    </span>
                  )}
                  {result.stats.unmatchedRight > 0 && (
                    <span className="text-amber-700 dark:text-amber-400">
                      {result.stats.unmatchedRight.toLocaleString()} unused
                      right
                    </span>
                  )}
                </div>
              )}
              {(result.config.mode === "concat" ||
                result.config.mode === "timeline") && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {result.stats.leftRows.toLocaleString()}
                    </span>{" "}
                    +{" "}
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {result.stats.rightRows.toLocaleString()}
                    </span>{" "}
                    ={" "}
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {result.stats.outputRows.toLocaleString()}
                    </span>{" "}
                    rows
                  </span>
                </div>
              )}
              {result.stats.notes.map((note, i) => (
                <div
                  key={i}
                  className="flex items-start gap-1 text-amber-700 dark:text-amber-400"
                >
                  <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                  <span>{note}</span>
                </div>
              ))}
            </div>
            {result.rows.length > 0 ? (
              <div className="max-h-[420px] flex flex-col overflow-hidden">
                <ResultPreview data={result.rows} />
              </div>
            ) : (
              <div className="px-3 py-4 text-xs text-slate-500 dark:text-slate-400 italic text-center">
                No rows produced. Try a different key pair or mode.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
