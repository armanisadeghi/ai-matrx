// components/admin/markdown-tester/BlockParserComparison.tsx
// Analysis tab — runs the three block parsers (local V2, Redux
// streaming accumulator, Python server endpoint) over the same input
// and shows the results side-by-side with byte-level drift highlights.
//
// Five columns: Raw input | V2 | Redux | Server | Diff Summary.
// A top banner reports total drift count and per-pair byte equality.

"use client";

import React, { useMemo, useState } from "react";
import { Loader2, Play, Copy, ChevronRight, ChevronDown } from "lucide-react";
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
import { useApiTestConfig } from "@/components/api-test-config/useApiTestConfig";
import { useMarkdownSamples } from "./useMarkdownSamples";
import { runV2Parser } from "./utils/run-v2-parser";
import type { SplitterBlock } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import {
  runReduxParser,
  type ReduxParseMode,
} from "./utils/run-redux-parser";
import { runServerParser } from "./utils/run-server-parser";
import {
  diffBlocks,
  findRawSegment,
  type DiffCell,
  type DiffReport,
} from "./utils/diff-blocks";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";

const CURRENT_INPUT = "__current__";

interface BlockParserComparisonProps {
  /** Live textarea content from the parent. Used when sampleId === current. */
  currentContent: string;
  /** Sample currently loaded into the textarea, if any. */
  loadedSampleId: string | null;
}

interface RunResult {
  raw: string;
  v2: SplitterBlock[];
  redux: RenderBlockPayload[];
  server: RenderBlockPayload[];
  report: DiffReport;
  serverMs: number;
  v2Ms: number;
  reduxMs: number;
}

function statusBadge(cell: DiffCell): {
  variant: "outline" | "default" | "destructive";
  label: string;
} {
  switch (cell.status) {
    case "match":
      return { variant: "outline", label: "✓ match" };
    case "type-drift":
      return { variant: "destructive", label: "⚠ type" };
    case "content-drift":
      return { variant: "destructive", label: "⚠ bytes" };
    case "missing":
      return { variant: "destructive", label: "∅ missing" };
  }
}

function ParserCell({ cell }: { cell: DiffCell }) {
  const block = cell.block;
  if (!block) {
    return (
      <div className="text-[11px] text-muted-foreground italic">
        — missing
      </div>
    );
  }
  const badge = statusBadge(cell);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono">
          #{block.index}
        </Badge>
        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
          {block.type}
        </Badge>
        <Badge variant={badge.variant} className="text-[10px] h-4 px-1.5">
          {badge.label}
        </Badge>
        <span className="text-[10px] text-muted-foreground font-mono ml-auto">
          {block.content.length} B
        </span>
      </div>
    </div>
  );
}

function PreviewBlock({
  label,
  text,
  highlightAt,
}: {
  label: string;
  text: string;
  highlightAt?: number;
}) {
  const before =
    typeof highlightAt === "number" && highlightAt >= 0
      ? text.slice(0, highlightAt)
      : text;
  const at =
    typeof highlightAt === "number" && highlightAt >= 0
      ? text.slice(highlightAt, highlightAt + 1)
      : "";
  const after =
    typeof highlightAt === "number" && highlightAt >= 0
      ? text.slice(highlightAt + 1)
      : "";
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <pre className="text-[11px] font-mono leading-snug whitespace-pre-wrap break-all bg-muted/30 rounded px-2 py-1.5 max-h-48 overflow-auto">
        {before}
        {at ? (
          <span className="bg-destructive/20 text-destructive font-bold">
            {at === "\n" ? "↵" : at === " " ? "·" : at}
          </span>
        ) : null}
        {after}
      </pre>
    </div>
  );
}

export function BlockParserComparison({
  currentContent,
  loadedSampleId,
}: BlockParserComparisonProps) {
  const apiConfig = useApiTestConfig({ defaultServerType: "local" });
  const { samples } = useMarkdownSamples();

  const [sampleId, setSampleId] = useState<string>(
    loadedSampleId ?? CURRENT_INPUT,
  );
  const [reduxMode, setReduxMode] = useState<ReduxParseMode>("one-shot");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const sourceContent = useMemo(() => {
    if (sampleId === CURRENT_INPUT) return currentContent;
    return samples.find((s) => s.id === sampleId)?.content ?? "";
  }, [sampleId, samples, currentContent]);

  const selectedSampleName = useMemo(() => {
    if (sampleId === CURRENT_INPUT) return "Current input";
    return samples.find((s) => s.id === sampleId)?.name ?? "Unknown sample";
  }, [sampleId, samples]);

  const handleRun = async () => {
    if (!sourceContent.trim()) {
      toast.error("Nothing to compare — pick a sample with content.");
      return;
    }
    setIsRunning(true);
    setError(null);
    setExpandedRow(null);

    try {
      const v2Start = performance.now();
      const v2Blocks = runV2Parser(sourceContent);
      const v2Ms = performance.now() - v2Start;

      const reduxStart = performance.now();
      const reduxBlocks = runReduxParser(sourceContent, { mode: reduxMode });
      const reduxMs = performance.now() - reduxStart;

      const serverStart = performance.now();
      const serverRes = await runServerParser(sourceContent, {
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
        raw: sourceContent,
        v2: v2Blocks,
        redux: reduxBlocks,
        server: serverRes.blocks,
        report,
        v2Ms,
        reduxMs,
        serverMs,
      });

      if (report.driftCount === 0) {
        toast.success("All parsers agree — no drift detected.");
      } else {
        toast.warning(
          `${report.driftCount} drift row${report.driftCount === 1 ? "" : "s"} detected.`,
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
    lines.push(`Source: ${selectedSampleName}`);
    lines.push(`Mode: redux=${reduxMode}`);
    lines.push(``);
    lines.push(
      `Drift rows: ${result.report.driftCount} / ${result.report.rows.length}`,
    );
    lines.push(
      `V2 vs Redux byte equality: ${(result.report.v2VsRedux * 100).toFixed(1)}%`,
    );
    lines.push(
      `V2 vs Server byte equality: ${(result.report.v2VsServer * 100).toFixed(1)}%`,
    );
    lines.push(
      `Redux vs Server byte equality: ${(result.report.reduxVsServer * 100).toFixed(1)}%`,
    );
    lines.push(``);
    for (const row of result.report.rows) {
      if (
        row.v2.status === "match" &&
        row.redux.status === "match" &&
        row.server.status === "match"
      ) {
        continue;
      }
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
      toast.error("Failed to copy report");
    }
  };

  return (
    <div className="flex-1 overflow-auto p-3 flex flex-col gap-3">
      {/* Controls */}
      <div className="flex-shrink-0 flex items-center gap-2 flex-wrap border rounded-lg p-2.5 bg-muted/30">
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground">Source</Label>
          <Select value={sampleId} onValueChange={setSampleId}>
            <SelectTrigger className="h-7 w-64 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CURRENT_INPUT}>
                Current input ({currentContent.length} chars)
              </SelectItem>
              {samples.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground">Redux mode</Label>
          <Select
            value={reduxMode}
            onValueChange={(v) => setReduxMode(v as ReduxParseMode)}
          >
            <SelectTrigger className="h-7 w-32 text-xs">
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
          disabled={isRunning || !sourceContent.trim()}
          className="h-7 px-2.5 text-xs"
        >
          {isRunning ? (
            <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
          ) : (
            <Play className="h-3 w-3 mr-1.5" />
          )}
          Run comparison
        </Button>

        {result && (
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopyReport}
            className="h-7 px-2.5 text-xs"
          >
            <Copy className="h-3 w-3 mr-1.5" />
            Copy report
          </Button>
        )}

        <div className="ml-auto text-[10px] text-muted-foreground">
          Server: <span className="font-mono">{apiConfig.baseUrl}</span>
        </div>
      </div>

      {error && (
        <div className="flex-shrink-0 p-2 rounded bg-destructive/10 border border-destructive/20 text-xs text-destructive">
          {error}
        </div>
      )}

      {!result && !isRunning && !error && (
        <div className="flex-1 flex flex-col items-center justify-center text-xs text-muted-foreground gap-2 py-12">
          <p>Pick a source, then click Run comparison.</p>
          <p>
            All three parsers run on the same content. Any byte-level
            difference is surfaced as drift.
          </p>
        </div>
      )}

      {result && (
        <>
          {/* Summary banner */}
          <div className="flex-shrink-0 flex items-center gap-1.5 flex-wrap text-xs">
            <Badge
              variant={result.report.driftCount === 0 ? "default" : "destructive"}
              className="h-5"
            >
              {result.report.driftCount === 0
                ? "All match"
                : `${result.report.driftCount} drift${result.report.driftCount === 1 ? "" : "s"}`}
            </Badge>
            <Badge variant="outline" className="h-5">
              {result.report.rows.length} rows
            </Badge>
            <Badge variant="outline" className="h-5 font-mono text-[10px]">
              V2 vs Redux: {(result.report.v2VsRedux * 100).toFixed(1)}%
            </Badge>
            <Badge variant="outline" className="h-5 font-mono text-[10px]">
              V2 vs Server: {(result.report.v2VsServer * 100).toFixed(1)}%
            </Badge>
            <Badge variant="outline" className="h-5 font-mono text-[10px]">
              Redux vs Server: {(result.report.reduxVsServer * 100).toFixed(1)}%
            </Badge>
            <span className="ml-auto text-[10px] text-muted-foreground font-mono">
              V2 {result.v2Ms.toFixed(1)}ms · Redux {result.reduxMs.toFixed(1)}ms
              · Server {result.serverMs.toFixed(1)}ms
            </span>
          </div>

          {/* Grid */}
          <div className="flex-1 min-h-0 border rounded-lg overflow-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-card border-b border-border">
                <tr className="text-left">
                  <th className="px-2 py-1.5 w-8" />
                  <th className="px-2 py-1.5 w-1/5">Raw</th>
                  <th className="px-2 py-1.5 w-1/5">V2 Local</th>
                  <th className="px-2 py-1.5 w-1/5">Redux</th>
                  <th className="px-2 py-1.5 w-1/5">Server</th>
                  <th className="px-2 py-1.5 w-1/5">Diff Summary</th>
                </tr>
              </thead>
              <tbody>
                {result.report.rows.map((row) => {
                  const isDrift =
                    row.v2.status !== "match" ||
                    row.redux.status !== "match" ||
                    row.server.status !== "match";
                  const isExpanded = expandedRow === row.index;
                  const rawSegment = findRawSegment(result.raw, row.v2.block);
                  return (
                    <React.Fragment key={row.index}>
                      <tr
                        className={`border-b border-border align-top ${
                          isDrift ? "bg-destructive/5" : ""
                        }`}
                      >
                        <td className="px-2 py-2 align-top">
                          <button
                            onClick={() =>
                              setExpandedRow(isExpanded ? null : row.index)
                            }
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </td>
                        <td className="px-2 py-2 align-top">
                          <pre className="text-[11px] font-mono leading-snug whitespace-pre-wrap break-all max-h-20 overflow-hidden text-muted-foreground">
                            {rawSegment.slice(0, 200)}
                            {rawSegment.length > 200 ? "…" : ""}
                          </pre>
                        </td>
                        <td className="px-2 py-2 align-top">
                          <ParserCell cell={row.v2} />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <ParserCell cell={row.redux} />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <ParserCell cell={row.server} />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <span
                            className={`text-[11px] ${
                              isDrift
                                ? "text-destructive"
                                : "text-muted-foreground"
                            }`}
                          >
                            {row.summary}
                          </span>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-border bg-muted/20">
                          <td />
                          <td colSpan={5} className="px-2 py-2">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                              <PreviewBlock
                                label="V2 content"
                                text={row.v2.block?.content ?? ""}
                              />
                              <PreviewBlock
                                label="Redux content"
                                text={row.redux.block?.content ?? ""}
                                highlightAt={row.redux.firstDiffAt}
                              />
                              <PreviewBlock
                                label="Server content"
                                text={row.server.block?.content ?? ""}
                                highlightAt={row.server.firstDiffAt}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
