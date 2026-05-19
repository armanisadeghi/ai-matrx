// components/markdown-studio/AnalysisView.tsx
// The polished drift-analysis surface. A prominent hero communicates
// the overall result at a glance (calm green when parsers agree, loud
// red when they don't), three equality tiles quantify pairwise byte
// match, and per-block cards expand on click to reveal character-level
// diffs aligned to the parser source.

"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cog,
  Copy,
  GaugeCircle,
  Play,
  ServerCog,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApiTestConfig } from "@/components/api-test-config/useApiTestConfig";
import {
  runV2Parser,
} from "@/components/admin/markdown-tester/utils/run-v2-parser";
import {
  runReduxParser,
  type ReduxParseMode,
} from "@/components/admin/markdown-tester/utils/run-redux-parser";
import { runServerParser } from "@/components/admin/markdown-tester/utils/run-server-parser";
import {
  diffBlocks,
  type DiffCell,
  type DiffReport,
} from "@/components/admin/markdown-tester/utils/diff-blocks";
import { getBlockTypeStyle } from "./block-type-colors";
import type { SplitterBlock } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";

interface AnalysisViewProps {
  content: string;
  contentLabel: string;
}

interface RunResult {
  raw: string;
  v2: SplitterBlock[];
  redux: RenderBlockPayload[];
  server: RenderBlockPayload[];
  report: DiffReport;
  timings: {
    v2: number;
    redux: number;
    server: number;
  };
}

export function AnalysisView({ content, contentLabel }: AnalysisViewProps) {
  const apiConfig = useApiTestConfig({ defaultServerType: "local" });
  const [reduxMode, setReduxMode] = useState<ReduxParseMode>("one-shot");
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const handleRun = async () => {
    if (!content.trim()) {
      toast.error("Nothing to compare — paste markdown into the editor first.");
      return;
    }
    setIsRunning(true);
    setError(null);
    setExpandedRow(null);

    try {
      const v2Start = performance.now();
      const v2Blocks = runV2Parser(content);
      const v2Ms = performance.now() - v2Start;

      const reduxStart = performance.now();
      const reduxBlocks = runReduxParser(content, { mode: reduxMode });
      const reduxMs = performance.now() - reduxStart;

      const serverStart = performance.now();
      const serverRes = await runServerParser(content, {
        baseUrl: apiConfig.baseUrl,
        authToken: apiConfig.authToken,
      });
      const serverMs = performance.now() - serverStart;

      const report = diffBlocks({
        v2: v2Blocks,
        redux: reduxBlocks,
        server: serverRes.blocks,
      });

      setResult({
        raw: content,
        v2: v2Blocks,
        redux: reduxBlocks,
        server: serverRes.blocks,
        report,
        timings: { v2: v2Ms, redux: reduxMs, server: serverMs },
      });

      if (report.driftCount === 0) {
        toast.success("Byte-perfect agreement across all three parsers.");
      } else {
        toast.warning(
          `${report.driftCount} block${report.driftCount === 1 ? "" : "s"} drifted between parsers.`,
        );
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Comparison run failed.";
      setError(message);
      toast.error(message);
    } finally {
      setIsRunning(false);
    }
  };

  const handleCopyReport = async () => {
    if (!result) return;
    const lines: string[] = [];
    lines.push(`# Block Parser Drift Report`);
    lines.push(`Source: ${contentLabel}`);
    lines.push(`Redux mode: ${reduxMode}`);
    lines.push(`Drift rows: ${result.report.driftCount} / ${result.report.rows.length}`);
    lines.push(`V2 vs Redux: ${(result.report.v2VsRedux * 100).toFixed(1)}%`);
    lines.push(`V2 vs Server: ${(result.report.v2VsServer * 100).toFixed(1)}%`);
    lines.push(`Redux vs Server: ${(result.report.reduxVsServer * 100).toFixed(1)}%`);
    lines.push("");
    for (const row of result.report.rows) {
      if (
        row.v2.status === "match" &&
        row.redux.status === "match" &&
        row.server.status === "match"
      )
        continue;
      lines.push(`## Row #${row.index}`);
      lines.push(`- v2: ${row.v2.block?.type ?? "—"} ${row.v2.status}`);
      lines.push(
        `- redux: ${row.redux.block?.type ?? "—"} ${row.redux.status}${
          row.redux.firstDiffAt >= 0 ? ` @byte ${row.redux.firstDiffAt}` : ""
        }`,
      );
      lines.push(
        `- server: ${row.server.block?.type ?? "—"} ${row.server.status}${
          row.server.firstDiffAt >= 0 ? ` @byte ${row.server.firstDiffAt}` : ""
        }`,
      );
      lines.push(`  ${row.summary}`);
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("Report copied to clipboard");
    } catch {
      toast.error("Clipboard copy failed");
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Control bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-background/60 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-1.5">
          <Workflow className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Parser drift analysis</span>
          <Badge variant="outline" className="ml-1 h-5 px-1.5 text-[10px]">
            {content.length} chars · {contentLabel}
          </Badge>
        </div>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Label className="text-[11px] text-muted-foreground">
              Redux mode
            </Label>
            <Select
              value={reduxMode}
              onValueChange={(v) => setReduxMode(v as ReduxParseMode)}
            >
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="one-shot">One-shot</SelectItem>
                <SelectItem value="chunked">Chunked (100B)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            onClick={handleRun}
            disabled={isRunning || !content.trim()}
            className="h-8 px-3 text-xs font-medium"
          >
            {isRunning ? (
              <>
                <GaugeCircle className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Comparing…
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 mr-1.5" />
                Run comparison
              </>
            )}
          </Button>
          {result && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopyReport}
              className="h-8 px-2.5 text-xs"
            >
              <Copy className="h-3 w-3 mr-1.5" />
              Copy report
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4" />
              Comparison failed
            </div>
            <p className="mt-1 text-xs">{error}</p>
          </div>
        )}

        {!result && !isRunning && !error && <EmptyAnalysisHero />}

        {result && (
          <>
            <DriftHero result={result} />
            <EqualityTiles result={result} />
            <BlockComparison
              result={result}
              expandedRow={expandedRow}
              onToggleRow={(idx) =>
                setExpandedRow((curr) => (curr === idx ? null : idx))
              }
            />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────────

function EmptyAnalysisHero() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="rounded-full bg-gradient-to-br from-primary/15 to-primary/5 p-4">
        <Workflow className="h-6 w-6 text-primary" />
      </div>
      <div className="space-y-1 max-w-md">
        <h3 className="text-base font-semibold">Three parsers, one truth.</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Run the comparison to send your markdown through the local V2
          splitter, the Redux streaming accumulator, and the Python server
          endpoint — then see any byte-level disagreement spelled out.
        </p>
      </div>
    </div>
  );
}

// ─── Hero status ───────────────────────────────────────────────────────────

function DriftHero({ result }: { result: RunResult }) {
  const isClean = result.report.driftCount === 0;
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border p-5",
        isClean
          ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent"
          : "border-destructive/40 bg-gradient-to-br from-destructive/10 via-destructive/5 to-transparent",
      )}
    >
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
            isClean
              ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
              : "bg-destructive/20 text-destructive",
          )}
        >
          {isClean ? (
            <CheckCircle2 className="h-6 w-6" />
          ) : (
            <AlertTriangle className="h-6 w-6" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold">
            {isClean
              ? "All three parsers agree, byte for byte."
              : `${result.report.driftCount} block${
                  result.report.driftCount === 1 ? "" : "s"
                } drifted across parsers.`}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {result.report.rows.length} block
            {result.report.rows.length === 1 ? "" : "s"} compared · V2{" "}
            {result.timings.v2.toFixed(1)}ms · Redux{" "}
            {result.timings.redux.toFixed(1)}ms · Server{" "}
            {result.timings.server.toFixed(1)}ms
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Equality tiles ────────────────────────────────────────────────────────

function EqualityTiles({ result }: { result: RunResult }) {
  const tiles = [
    {
      label: "V2 ↔ Redux",
      pct: result.report.v2VsRedux,
      desc: "Local splitter vs Redux streaming accumulator",
    },
    {
      label: "V2 ↔ Server",
      pct: result.report.v2VsServer,
      desc: "Local splitter vs Python endpoint",
    },
    {
      label: "Redux ↔ Server",
      pct: result.report.reduxVsServer,
      desc: "Streaming accumulator vs Python endpoint",
    },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {tiles.map((tile) => (
        <EqualityTile key={tile.label} {...tile} />
      ))}
    </div>
  );
}

function EqualityTile({
  label,
  pct,
  desc,
}: {
  label: string;
  pct: number;
  desc: string;
}) {
  const value = Math.round(pct * 1000) / 10;
  const isPerfect = pct >= 1;
  return (
    <div className="rounded-xl border border-border bg-card/40 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "font-mono text-2xl font-semibold tabular-nums",
            isPerfect
              ? "text-emerald-600 dark:text-emerald-400"
              : value >= 90
                ? "text-amber-600 dark:text-amber-400"
                : "text-destructive",
          )}
        >
          {value.toFixed(1)}%
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
        {desc}
      </p>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted/40">
        <div
          className={cn(
            "h-full transition-all",
            isPerfect
              ? "bg-emerald-500"
              : value >= 90
                ? "bg-amber-500"
                : "bg-destructive",
          )}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

// ─── Per-block comparison ──────────────────────────────────────────────────

function BlockComparison({
  result,
  expandedRow,
  onToggleRow,
}: {
  result: RunResult;
  expandedRow: number | null;
  onToggleRow: (idx: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between px-1">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Block-by-block
        </h3>
        <span className="text-[10px] text-muted-foreground font-mono">
          click any row to expand the byte diff
        </span>
      </div>
      {result.report.rows.map((row) => {
        const isExpanded = expandedRow === row.index;
        const isDrift =
          row.v2.status !== "match" ||
          row.redux.status !== "match" ||
          row.server.status !== "match";
        const baselineType = row.v2.block?.type ?? "—";
        const style = getBlockTypeStyle(baselineType);

        return (
          <div
            key={row.index}
            className={cn(
              "rounded-lg border bg-card/40 transition-colors",
              isDrift
                ? "border-destructive/30 bg-destructive/[0.03]"
                : "border-border",
            )}
          >
            <button
              onClick={() => onToggleRow(row.index)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-mono">
                #{row.index}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  "h-5 px-1.5 text-[10px] font-medium",
                  style.bg,
                  style.text,
                  style.border,
                )}
              >
                {baselineType}
              </Badge>
              <div className="flex items-center gap-1.5">
                <SourceChip label="V2" cell={row.v2} />
                <SourceChip label="Redux" cell={row.redux} />
                <SourceChip label="Server" cell={row.server} />
              </div>
              <span
                className={cn(
                  "ml-auto text-[11px] leading-tight",
                  isDrift ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {row.summary}
              </span>
            </button>

            {isExpanded && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 border-t border-border bg-muted/10 p-3">
                <DiffPanel label="V2" cell={row.v2} highlight={false} />
                <DiffPanel label="Redux" cell={row.redux} highlight />
                <DiffPanel label="Server" cell={row.server} highlight />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SourceChip({ label, cell }: { label: string; cell: DiffCell }) {
  const variant = (() => {
    switch (cell.status) {
      case "match":
        return "emerald";
      case "type-drift":
        return "amber";
      case "content-drift":
        return "rose";
      case "missing":
        return "muted";
    }
  })();
  const cls = {
    emerald:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    amber:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    rose:
      "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    muted:
      "border-border bg-muted/40 text-muted-foreground",
  }[variant];
  const symbol = {
    match: "✓",
    "type-drift": "⚠",
    "content-drift": "≠",
    missing: "∅",
  }[cell.status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
        cls,
      )}
      title={`${label}: ${cell.status}${cell.firstDiffAt >= 0 ? ` @byte ${cell.firstDiffAt}` : ""}`}
    >
      <span className="font-mono">{symbol}</span>
      <span>{label}</span>
    </span>
  );
}

function DiffPanel({
  label,
  cell,
  highlight,
}: {
  label: string;
  cell: DiffCell;
  highlight: boolean;
}) {
  const block = cell.block;
  const icon =
    label === "Server" ? (
      <ServerCog className="h-3 w-3" />
    ) : label === "Redux" ? (
      <Cog className="h-3 w-3" />
    ) : (
      <Boxes className="h-3 w-3" />
    );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
        </span>
        <span className="text-[10px] text-muted-foreground font-mono">
          {(block?.content ?? "").length} B
        </span>
      </div>
      {block ? (
        <DiffPre
          text={block.content}
          highlightAt={highlight ? cell.firstDiffAt : -1}
        />
      ) : (
        <div className="rounded-md border border-dashed border-border bg-muted/20 px-2 py-3 text-center text-[11px] text-muted-foreground italic">
          missing
        </div>
      )}
    </div>
  );
}

function DiffPre({
  text,
  highlightAt,
}: {
  text: string;
  highlightAt: number;
}) {
  if (highlightAt < 0) {
    return (
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-background/40 px-2 py-1.5 text-[11px] font-mono leading-snug text-muted-foreground">
        {text || "(empty)"}
      </pre>
    );
  }
  const before = text.slice(0, highlightAt);
  const at = text.slice(highlightAt, highlightAt + 1);
  const after = text.slice(highlightAt + 1);
  const visibleAt = at === "\n" ? "↵\n" : at === " " ? "·" : at;
  return (
    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md border border-rose-500/30 bg-rose-500/[0.04] px-2 py-1.5 text-[11px] font-mono leading-snug">
      <span className="text-muted-foreground">{before}</span>
      <span className="bg-rose-500/30 px-0.5 font-bold text-rose-700 dark:text-rose-300">
        {visibleAt}
      </span>
      <span className="text-muted-foreground">{after}</span>
    </pre>
  );
}

export type { AnalysisViewProps };
