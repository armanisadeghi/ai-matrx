// components/markdown-studio/lab/JsonExtractionPanel.tsx
//
// JSON extraction test bench — one-shot `extractAllJson` or a simulated
// chunked stream through `StreamingJsonTracker`. Extracted from the admin
// Markdown Tester (2026-09-23, RC-B1) so the Markdown Studio and the admin
// tester render the same panel.

"use client";

import React, { useRef, useState } from "react";
import { CheckCircle2, Copy, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  extractAllJson,
  type ExtractedJson,
  type ExtractionOptions,
} from "@/utils/json/extract-json";
import {
  StreamingJsonTracker,
  type StreamingJsonState,
} from "@/utils/json/streaming-json-tracker";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { StreamSimControls } from "./StreamSimControls";
import {
  DEFAULT_STREAM_SIM_SETTINGS,
  type StreamSimSettings,
} from "./stream-chunks";
import { progressForText, useStreamSimulation } from "./useStreamSimulation";

export interface JsonExtractionPanelProps {
  content: string;
}

export function JsonExtractionPanel({ content }: JsonExtractionPanelProps) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [allowFuzzy, setAllowFuzzy] = useState(false);
  const [repairEnabled, setRepairEnabled] = useState(true);
  const [maxResults, setMaxResults] = useState(Infinity);
  const [maxResultsInput, setMaxResultsInput] = useState("∞");

  const [extractionResults, setExtractionResults] = useState<ExtractedJson[]>(
    [],
  );
  const [extractionTime, setExtractionTime] = useState(0);

  const [simSettings, setSimSettings] = useState<StreamSimSettings>(
    DEFAULT_STREAM_SIM_SETTINGS,
  );
  const [streamingState, setStreamingState] =
    useState<StreamingJsonState | null>(null);
  const trackerRef = useRef<StreamingJsonTracker | null>(null);
  const sim = useStreamSimulation();

  const runExtraction = () => {
    const opts: ExtractionOptions = {
      isStreaming,
      allowFuzzy,
      repairEnabled,
      maxResults: isFinite(maxResults) ? maxResults : undefined,
    };
    const t0 = performance.now();
    const results = extractAllJson(content, opts);
    setExtractionTime(performance.now() - t0);
    setExtractionResults(results);
    setStreamingState(null);
  };

  const runStreamSimulation = () => {
    setExtractionResults([]);
    const tracker = new StreamingJsonTracker({
      repairEnabled,
      maxResults: isFinite(maxResults) ? maxResults : undefined,
      fuzzyOnFinalize: allowFuzzy,
    });
    trackerRef.current = tracker;
    void sim.run(content, simSettings, {
      onChunk: (chunk) => {
        const state = tracker.append(chunk);
        setStreamingState({ ...state });
      },
      onComplete: () => {
        setStreamingState({ ...tracker.finalize() });
      },
    });
  };

  const resetAll = () => {
    sim.reset();
    setExtractionResults([]);
    setStreamingState(null);
    setExtractionTime(0);
    trackerRef.current?.reset();
  };

  const handleMaxResultsChange = (val: string) => {
    setMaxResultsInput(val);
    if (val === "∞" || val === "" || val === "Infinity") {
      setMaxResults(Infinity);
    } else {
      const n = parseInt(val, 10);
      if (!isNaN(n) && n > 0) setMaxResults(n);
    }
  };

  const results = streamingState?.results ?? extractionResults;

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-auto p-3">
      <div className="flex-shrink-0 space-y-2 rounded-lg border bg-muted/30 p-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <ToggleChip id="je-repair" label="Repair" checked={repairEnabled} onChange={setRepairEnabled} />
          <ToggleChip id="je-fuzzy" label="Fuzzy" checked={allowFuzzy} onChange={setAllowFuzzy} />
          <ToggleChip id="je-streaming" label="Streaming mode" checked={isStreaming} onChange={setIsStreaming} />
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">Max results</Label>
            <input
              type="text"
              value={maxResultsInput}
              onChange={(e) => handleMaxResultsChange(e.target.value)}
              className="h-6 w-12 rounded border bg-background px-1 text-center font-mono text-xs"
              style={{ fontSize: "16px" }}
              aria-label="Max results"
            />
          </div>
          <Separator orientation="vertical" className="h-5" />
          <Button
            size="sm"
            onClick={runExtraction}
            className="h-7 px-2.5 text-xs"
            disabled={!content.trim()}
          >
            <Play className="mr-1 h-3 w-3" />
            Extract now
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={resetAll}
            className="h-7 px-2.5 text-xs"
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            Reset
          </Button>
        </div>
        <StreamSimControls
          settings={simSettings}
          onSettingsChange={setSimSettings}
          progress={progressForText(sim, content)}
          onRun={runStreamSimulation}
          onStop={sim.stop}
          disabled={!content.trim()}
        />
      </div>

      {(streamingState || extractionTime > 0) && (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 text-xs">
          {streamingState ? (
            <>
              <Badge variant={streamingState.isAllComplete ? "default" : "secondary"}>
                rev {streamingState.revision}
              </Badge>
              <Badge variant="outline">{streamingState.results.length} found</Badge>
              <Badge variant={streamingState.isAllComplete ? "default" : "destructive"}>
                {streamingState.isAllComplete ? "All complete" : "Incomplete"}
              </Badge>
              {streamingState.hasOpenFence && (
                <Badge variant="destructive">Open fence</Badge>
              )}
            </>
          ) : (
            <>
              <Badge variant="outline">{extractionResults.length} found</Badge>
              <Badge variant="outline">{extractionTime.toFixed(2)}ms</Badge>
              <Badge
                variant={
                  extractionResults.every((r) => r.isComplete)
                    ? "default"
                    : "destructive"
                }
              >
                {extractionResults.every((r) => r.isComplete)
                  ? "All complete"
                  : "Has incomplete"}
              </Badge>
            </>
          )}
        </div>
      )}

      {results.length === 0 && !sim.isRunning && (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          Extract now for a one-shot pass, or simulate a stream for chunked
          extraction.
        </div>
      )}

      {results.length > 0 && (
        <div className="flex-1 space-y-2 overflow-auto">
          {results.map((r, idx) => (
            <JsonResultCard key={idx} result={r} index={idx} />
          ))}
        </div>
      )}
    </div>
  );
}

function ToggleChip({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-0.5">
      <Label htmlFor={id} className="cursor-pointer select-none text-xs">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function JsonResultCard({
  result,
  index,
}: {
  result: ExtractedJson;
  index: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  let jsonStr: string;
  try {
    jsonStr = JSON.stringify(result.value, null, 2);
  } catch {
    jsonStr = String(result.value);
  }

  const handleCopy = async () => {
    await copyToClipboard(jsonStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <button
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/50"
        onClick={() => setExpanded(!expanded)}
      >
        <Badge variant="secondary" className="h-4 px-1.5 font-mono text-[10px]">
          #{index + 1}
        </Badge>
        <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
          {result.type}
        </Badge>
        <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
          {result.source}
        </Badge>
        <Badge
          variant={result.isComplete ? "default" : "destructive"}
          className="h-4 px-1.5 text-[10px]"
        >
          {result.isComplete ? "complete" : "incomplete"}
        </Badge>
        {result.repairApplied && (
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
            repaired
          </Badge>
        )}
        <span className="ml-auto font-mono text-muted-foreground">
          [{result.startIndex}–{result.endIndex}]
        </span>
      </button>

      {expanded && (
        <div className="border-t">
          {result.warnings.length > 0 && (
            <div className="border-b bg-yellow-500/5 px-2.5 py-1 text-[10px] text-yellow-700 dark:text-yellow-400">
              {result.warnings.join(" · ")}
            </div>
          )}
          <div className="relative">
            <Button
              size="sm"
              variant="ghost"
              className="absolute right-1 top-1 z-10 h-5 px-1.5 text-[10px]"
              onClick={() => void handleCopy()}
              aria-label="Copy JSON"
            >
              {copied ? (
                <CheckCircle2 className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
            <pre className="max-h-80 overflow-auto bg-muted/20 p-2.5 font-mono text-[11px] leading-snug">
              {jsonStr}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
