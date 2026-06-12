"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PromptEditorContextMenu } from "@/features/prompts/components/PromptEditorContextMenu";
import MarkdownStream from "@/components/MarkdownStream";
import { parseMarkdownToText } from "@/utils/markdown-processors/parse-markdown-for-speech";
import { AudioTestModal } from "@/components/admin/AudioTestModal";
import { useApiTestConfig } from "@/components/api-test-config/useApiTestConfig";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { parseNdjsonStream } from "@/lib/api/stream-parser";
import type {
  TypedStreamEvent,
  RenderBlockEvent,
} from "@/types/python-generated/stream-events";
import {
  CheckCircle2,
  Copy,
  FileText,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  RefreshCw,
  Zap,
  Hand,
  Volume2,
  Loader2,
  Waves,
  Cpu,
  Link,
  Unlink,
  Braces,
  Play,
  Square,
  RotateCcw,
} from "lucide-react";
import { SpeakerGroup } from "@/features/tts/components/SpeakerGroup";
import { useMarkdownAutosave } from "./markdown-tester/useMarkdownAutosave";
import { SampleManager } from "./markdown-tester/SampleManager";
import { BlockParserComparison } from "./markdown-tester/BlockParserComparison";
import type { MarkdownSample } from "./markdown-tester/samples-service";
import { GitCompare } from "lucide-react";
import {
  extractAllJson,
  type ExtractedJson,
  type ExtractionOptions,
} from "@/utils/json/extract-json";
import {
  StreamingJsonTracker,
  type StreamingJsonState,
} from "@/utils/json/streaming-json-tracker";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MarkdownTesterProps {
  className?: string;
}

const SAMPLE_CONTENT = ``;

/**
 * Structural segment from raw markdown text.
 * Each segment covers a contiguous range of lines that map to
 * a single rendered block (paragraph, heading, code block, list, etc.).
 */
interface TextSegment {
  startLine: number;
  endLine: number;
  type:
    | "heading"
    | "code"
    | "hr"
    | "list"
    | "blockquote"
    | "table"
    | "paragraph"
    | "blank";
}

/**
 * Parses raw markdown into structural segments. Each segment represents
 * one "rendered block" — the unit that will become a single top-level
 * DOM element in the preview.
 */
function parseTextSegments(text: string): TextSegment[] {
  const lines = text.split("\n");
  const segments: TextSegment[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // Blank lines
    if (trimmed === "") {
      const start = i;
      while (i < lines.length && lines[i].trim() === "") i++;
      segments.push({ startLine: start, endLine: i, type: "blank" });
      continue;
    }

    // Fenced code block (``` or ~~~)
    if (/^(`{3,}|~{3,})/.test(trimmed)) {
      const fence = trimmed.match(/^(`{3,}|~{3,})/)![1];
      const fenceChar = fence[0];
      const fenceLen = fence.length;
      const start = i;
      i++;
      while (i < lines.length) {
        const lt = lines[i].trim();
        if (new RegExp(`^${fenceChar}{${fenceLen},}$`).test(lt)) {
          i++;
          break;
        }
        i++;
      }
      segments.push({ startLine: start, endLine: i, type: "code" });
      continue;
    }

    // Heading
    if (/^#{1,6}\s/.test(trimmed)) {
      segments.push({ startLine: i, endLine: i + 1, type: "heading" });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      segments.push({ startLine: i, endLine: i + 1, type: "hr" });
      i++;
      continue;
    }

    // List item (unordered or ordered) — consume the entire list
    if (/^[-*+]\s|^\d+[.)]\s/.test(trimmed)) {
      const start = i;
      i++;
      while (i < lines.length) {
        const lt = lines[i].trim();
        if (lt === "") {
          i++;
          break;
        }
        i++;
      }
      segments.push({ startLine: start, endLine: i, type: "list" });
      continue;
    }

    // Blockquote
    if (trimmed.startsWith(">")) {
      const start = i;
      i++;
      while (
        i < lines.length &&
        (lines[i].trim().startsWith(">") ||
          (lines[i].trim() !== "" && lines[i - 1]?.trim().startsWith(">")))
      )
        i++;
      segments.push({ startLine: start, endLine: i, type: "blockquote" });
      continue;
    }

    // Table (line with pipes)
    if (
      trimmed.includes("|") &&
      i + 1 < lines.length &&
      /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(lines[i + 1]?.trim())
    ) {
      const start = i;
      i++;
      while (
        i < lines.length &&
        lines[i].trim().includes("|") &&
        lines[i].trim() !== ""
      )
        i++;
      segments.push({ startLine: start, endLine: i, type: "table" });
      continue;
    }

    // Paragraph — consecutive non-blank, non-special lines
    {
      const start = i;
      i++;
      while (i < lines.length) {
        const lt = lines[i].trim();
        if (
          lt === "" ||
          /^#{1,6}\s/.test(lt) ||
          /^(`{3,}|~{3,})/.test(lt) ||
          /^(-{3,}|\*{3,}|_{3,})$/.test(lt) ||
          /^[-*+]\s|^\d+[.)]\s/.test(lt) ||
          lt.startsWith(">")
        )
          break;
        i++;
      }
      segments.push({ startLine: start, endLine: i, type: "paragraph" });
    }
  }

  return segments;
}

/**
 * Finds rendered block elements and returns their offset and height
 * relative to the scroll container. Skips nested elements to avoid
 * double-counting (e.g. a <pre> inside a <div data-block-type>).
 */
function getRenderedBlocks(
  scrollContainer: HTMLElement,
): Array<{ top: number; height: number }> {
  const blockSelectors =
    "p, h1, h2, h3, h4, h5, h6, pre, ul, ol, table, hr, blockquote, [data-block-type]";
  const allBlocks = scrollContainer.querySelectorAll(blockSelectors);
  const containerRect = scrollContainer.getBoundingClientRect();
  const scrollY = scrollContainer.scrollTop;

  const seen = new Set<Element>();
  const result: Array<{ top: number; height: number }> = [];

  allBlocks.forEach((el) => {
    // Skip if this element is nested inside another matched element
    let parent = el.parentElement;
    let isNested = false;
    while (parent && parent !== scrollContainer) {
      if (seen.has(parent)) {
        isNested = true;
        break;
      }
      parent = parent.parentElement;
    }
    if (isNested) return;

    seen.add(el);
    const rect = el.getBoundingClientRect();
    result.push({
      top: rect.top - containerRect.top + scrollY,
      height: rect.height,
    });
  });

  return result;
}

/**
 * Builds paired checkpoints between raw text and rendered preview.
 *
 * Strategy: parse the raw text into N non-blank segments, find N rendered
 * blocks, and create (segment-line-offset → rendered-pixel-offset) pairs.
 * If counts don't match, falls back to proportional scroll mapping.
 */
function buildPairedCheckpoints(
  text: string,
  lineHeight: number,
  scrollContainer: HTMLElement,
): { textPx: number[]; renderPx: number[] } | null {
  const segments = parseTextSegments(text).filter((s) => s.type !== "blank");
  const renderedBlocks = getRenderedBlocks(scrollContainer);

  if (segments.length === 0 || renderedBlocks.length === 0) return null;

  // Build pairs: for each segment, map start line → rendered block top
  const count = Math.min(segments.length, renderedBlocks.length);
  const textPx: number[] = [0];
  const renderPx: number[] = [0];

  for (let i = 0; i < count; i++) {
    const textOffset = segments[i].startLine * lineHeight;
    const renderOffset = renderedBlocks[i].top;

    if (textOffset > 0) textPx.push(textOffset);
    if (renderOffset > 0) renderPx.push(renderOffset);

    // Also add end-of-segment checkpoints for large blocks (code, tables)
    if (
      segments[i].type === "code" ||
      segments[i].type === "table" ||
      segments[i].type === "list"
    ) {
      const textEnd = segments[i].endLine * lineHeight;
      const renderEnd = renderedBlocks[i].top + renderedBlocks[i].height;
      textPx.push(textEnd);
      renderPx.push(renderEnd);
    }
  }

  // Deduplicate and sort
  const uniqueText = [...new Set(textPx)].sort((a, b) => a - b);
  const uniqueRender = [...new Set(renderPx)].sort((a, b) => a - b);

  // Ensure same length by trimming to shorter
  const len = Math.min(uniqueText.length, uniqueRender.length);
  return {
    textPx: uniqueText.slice(0, len),
    renderPx: uniqueRender.slice(0, len),
  };
}

/**
 * Maps a scroll position from source checkpoints to target checkpoints
 * using piecewise linear interpolation. Falls back to proportional
 * mapping when checkpoints are insufficient.
 */
function mapScroll(
  scrollTop: number,
  srcPoints: number[],
  tgtPoints: number[],
  srcMax: number,
  tgtMax: number,
): number {
  if (srcPoints.length < 2 || tgtPoints.length < 2 || srcMax <= 0) {
    return tgtMax > 0 && srcMax > 0 ? (scrollTop / srcMax) * tgtMax : 0;
  }

  // Before first checkpoint
  if (scrollTop <= srcPoints[0]) {
    return tgtPoints[0];
  }

  // Between checkpoints — piecewise interpolation
  for (let i = 0; i < srcPoints.length - 1; i++) {
    if (scrollTop >= srcPoints[i] && scrollTop <= srcPoints[i + 1]) {
      const segLen = srcPoints[i + 1] - srcPoints[i];
      const frac = segLen > 0 ? (scrollTop - srcPoints[i]) / segLen : 0;
      return tgtPoints[i] + frac * (tgtPoints[i + 1] - tgtPoints[i]);
    }
  }

  // Past last checkpoint — proportional for the remainder
  const lastSrc = srcPoints[srcPoints.length - 1];
  const lastTgt = tgtPoints[tgtPoints.length - 1];
  const remaining = srcMax - lastSrc;
  const tgtRemaining = tgtMax - lastTgt;
  if (remaining <= 0) return lastTgt;
  const frac = (scrollTop - lastSrc) / remaining;
  return lastTgt + frac * tgtRemaining;
}

// =============================================================================
// JSON Extraction Test Panel
// =============================================================================

type ChunkStrategy = "random" | "char-by-char" | "word" | "line" | "mid-json";

interface JsonExtractionPanelProps {
  content: string;
}

function JsonExtractionPanel({ content }: JsonExtractionPanelProps) {
  // ── Options state ──
  const [isStreaming, setIsStreaming] = useState(false);
  const [allowFuzzy, setAllowFuzzy] = useState(false);
  const [repairEnabled, setRepairEnabled] = useState(true);
  const [maxResults, setMaxResults] = useState(Infinity);
  const [maxResultsInput, setMaxResultsInput] = useState("∞");

  // ── Non-streaming results ──
  const [extractionResults, setExtractionResults] = useState<ExtractedJson[]>(
    [],
  );
  const [extractionTime, setExtractionTime] = useState(0);

  // ── Streaming simulation state ──
  const [chunkStrategy, setChunkStrategy] = useState<ChunkStrategy>("random");
  const [chunkDelayMs, setChunkDelayMs] = useState(30);
  const [minChunkSize, setMinChunkSize] = useState(1);
  const [maxChunkSize, setMaxChunkSize] = useState(40);
  const [streamingState, setStreamingState] =
    useState<StreamingJsonState | null>(null);
  const [isStreamRunning, setIsStreamRunning] = useState(false);
  const [streamProgress, setStreamProgress] = useState(0);
  const [streamChunksProcessed, setStreamChunksProcessed] = useState(0);
  const [streamElapsed, setStreamElapsed] = useState(0);
  const streamAbortRef = useRef(false);
  const trackerRef = useRef<StreamingJsonTracker | null>(null);

  // ── Non-streaming extraction ──
  const runExtraction = useCallback(() => {
    const opts: ExtractionOptions = {
      isStreaming,
      allowFuzzy,
      repairEnabled,
      maxResults: isFinite(maxResults) ? maxResults : undefined,
    };
    const t0 = performance.now();
    const results = extractAllJson(content, opts);
    const elapsed = performance.now() - t0;
    setExtractionResults(results);
    setExtractionTime(elapsed);
    setStreamingState(null);
  }, [content, isStreaming, allowFuzzy, repairEnabled, maxResults]);

  // ── Chunk generators for different strategies ──
  const generateChunks = useCallback(
    (text: string): string[] => {
      const chunks: string[] = [];

      switch (chunkStrategy) {
        case "char-by-char":
          for (const ch of text) chunks.push(ch);
          break;

        case "word":
          for (const match of text.matchAll(/(\S+\s*)/g)) chunks.push(match[0]);
          break;

        case "line":
          for (const line of text.split("\n")) chunks.push(line + "\n");
          break;

        case "mid-json": {
          // Deliberately split in the middle of JSON structures
          let i = 0;
          while (i < text.length) {
            const remaining = text.length - i;
            let size: number;

            // If we see the start of a JSON structure, split right through it
            const nextBrace = text.indexOf("{", i);
            const nextBracket = text.indexOf("[", i);
            const nextQuote = text.indexOf('"', i);
            const targets = [nextBrace, nextBracket, nextQuote].filter(
              (t) => t > i && t < i + maxChunkSize,
            );

            if (targets.length > 0) {
              // Cut right after the structural character
              const target = Math.min(...targets);
              size = target - i + 1;
            } else {
              size = Math.min(
                minChunkSize +
                  Math.floor(Math.random() * (maxChunkSize - minChunkSize + 1)),
                remaining,
              );
            }

            chunks.push(text.slice(i, i + size));
            i += size;
          }
          break;
        }

        case "random":
        default: {
          let i = 0;
          while (i < text.length) {
            const remaining = text.length - i;
            const size = Math.min(
              minChunkSize +
                Math.floor(Math.random() * (maxChunkSize - minChunkSize + 1)),
              remaining,
            );
            chunks.push(text.slice(i, i + size));
            i += size;
          }
          break;
        }
      }

      return chunks;
    },
    [chunkStrategy, minChunkSize, maxChunkSize],
  );

  // ── Streaming simulation ──
  const runStreamSimulation = useCallback(async () => {
    streamAbortRef.current = false;
    setIsStreamRunning(true);
    setStreamProgress(0);
    setStreamChunksProcessed(0);
    setExtractionResults([]);

    const tracker = new StreamingJsonTracker({
      repairEnabled,
      maxResults: isFinite(maxResults) ? maxResults : undefined,
      fuzzyOnFinalize: allowFuzzy,
    });
    trackerRef.current = tracker;

    const chunks = generateChunks(content);
    const totalChunks = chunks.length;
    const t0 = performance.now();

    for (let i = 0; i < totalChunks; i++) {
      if (streamAbortRef.current) break;

      const state = tracker.append(chunks[i]);
      setStreamingState({ ...state });
      setStreamProgress(((i + 1) / totalChunks) * 100);
      setStreamChunksProcessed(i + 1);
      setStreamElapsed(performance.now() - t0);

      if (chunkDelayMs > 0) {
        await new Promise((r) => setTimeout(r, chunkDelayMs));
      }
    }

    if (!streamAbortRef.current) {
      const finalState = tracker.finalize();
      setStreamingState({ ...finalState });
      setStreamElapsed(performance.now() - t0);
    }

    setIsStreamRunning(false);
  }, [
    content,
    repairEnabled,
    maxResults,
    allowFuzzy,
    chunkDelayMs,
    generateChunks,
  ]);

  const stopStream = useCallback(() => {
    streamAbortRef.current = true;
  }, []);

  const resetAll = useCallback(() => {
    streamAbortRef.current = true;
    setExtractionResults([]);
    setStreamingState(null);
    setStreamProgress(0);
    setStreamChunksProcessed(0);
    setStreamElapsed(0);
    setExtractionTime(0);
    trackerRef.current?.reset();
  }, []);

  const handleMaxResultsChange = useCallback((val: string) => {
    setMaxResultsInput(val);
    if (val === "∞" || val === "" || val === "Infinity") {
      setMaxResults(Infinity);
    } else {
      const n = parseInt(val, 10);
      if (!isNaN(n) && n > 0) setMaxResults(n);
    }
  }, []);

  const results = streamingState?.results ?? extractionResults;
  const showStreamingInfo = streamingState !== null;

  return (
    <div className="flex-1 overflow-auto p-3 flex flex-col gap-3">
      {/* ── Options Bar ── */}
      <div className="flex-shrink-0 space-y-2 border rounded-lg p-2.5 bg-muted/30">
        {/* Row 1: Mode + extraction options */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 border rounded-md px-2 py-0.5 bg-background">
            <Label
              htmlFor="je-repair"
              className="text-xs cursor-pointer select-none"
            >
              Repair
            </Label>
            <Switch
              id="je-repair"
              checked={repairEnabled}
              onCheckedChange={setRepairEnabled}
            />
          </div>

          <div className="flex items-center gap-1.5 border rounded-md px-2 py-0.5 bg-background">
            <Label
              htmlFor="je-fuzzy"
              className="text-xs cursor-pointer select-none"
            >
              Fuzzy
            </Label>
            <Switch
              id="je-fuzzy"
              checked={allowFuzzy}
              onCheckedChange={setAllowFuzzy}
            />
          </div>

          <div className="flex items-center gap-1.5 border rounded-md px-2 py-0.5 bg-background">
            <Label
              htmlFor="je-streaming"
              className="text-xs cursor-pointer select-none"
            >
              Streaming Mode
            </Label>
            <Switch
              id="je-streaming"
              checked={isStreaming}
              onCheckedChange={setIsStreaming}
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">Max Results</Label>
            <input
              type="text"
              value={maxResultsInput}
              onChange={(e) => handleMaxResultsChange(e.target.value)}
              className="w-12 h-6 text-xs text-center border rounded bg-background px-1 font-mono"
              style={{ fontSize: "16px" }}
            />
          </div>

          <Separator orientation="vertical" className="h-5" />

          <Button
            size="sm"
            onClick={runExtraction}
            className="h-7 px-2.5 text-xs"
            disabled={!content.trim()}
          >
            <Play className="h-3 w-3 mr-1" />
            Extract Now
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={resetAll}
            className="h-7 px-2.5 text-xs"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Reset
          </Button>
        </div>

        {/* Row 2: Streaming simulation options */}
        <div className="flex items-center gap-3 flex-wrap">
          <Label className="text-xs font-medium text-muted-foreground">
            Stream Sim:
          </Label>

          <Select
            value={chunkStrategy}
            onValueChange={(v) => setChunkStrategy(v as ChunkStrategy)}
          >
            <SelectTrigger className="h-6 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="random">Random</SelectItem>
              <SelectItem value="char-by-char">Char-by-char</SelectItem>
              <SelectItem value="word">Word</SelectItem>
              <SelectItem value="line">Line</SelectItem>
              <SelectItem value="mid-json">Mid-JSON</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">
              Delay {chunkDelayMs}ms
            </Label>
            <Slider
              value={[chunkDelayMs]}
              onValueChange={([v]) => setChunkDelayMs(v)}
              min={0}
              max={200}
              step={5}
              className="w-24"
            />
          </div>

          {chunkStrategy !== "char-by-char" &&
            chunkStrategy !== "word" &&
            chunkStrategy !== "line" && (
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">
                  Size {minChunkSize}–{maxChunkSize}
                </Label>
                <Slider
                  value={[minChunkSize, maxChunkSize]}
                  onValueChange={([lo, hi]) => {
                    setMinChunkSize(lo);
                    setMaxChunkSize(hi);
                  }}
                  min={1}
                  max={200}
                  step={1}
                  className="w-32"
                />
              </div>
            )}

          <Separator orientation="vertical" className="h-5" />

          {isStreamRunning ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={stopStream}
              className="h-7 px-2.5 text-xs"
            >
              <Square className="h-3 w-3 mr-1" />
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={runStreamSimulation}
              className="h-7 px-2.5 text-xs"
              disabled={!content.trim()}
            >
              <Waves className="h-3 w-3 mr-1" />
              Simulate Stream
            </Button>
          )}
        </div>
      </div>

      {/* ── Status Bar ── */}
      {(showStreamingInfo ||
        extractionResults.length > 0 ||
        extractionTime > 0) && (
        <div className="flex-shrink-0 flex items-center gap-2 flex-wrap text-xs">
          {showStreamingInfo && (
            <>
              <Badge
                variant={streamingState.isAllComplete ? "default" : "secondary"}
              >
                rev {streamingState.revision}
              </Badge>
              <Badge variant="outline">
                {streamingState.results.length} found
              </Badge>
              <Badge
                variant={
                  streamingState.isAllComplete ? "default" : "destructive"
                }
              >
                {streamingState.isAllComplete ? "All Complete" : "Incomplete"}
              </Badge>
              {streamingState.hasOpenFence && (
                <Badge variant="destructive">Open Fence</Badge>
              )}
              <Badge variant="outline">{streamChunksProcessed} chunks</Badge>
              <Badge variant="outline">{streamProgress.toFixed(0)}%</Badge>
              <Badge variant="outline">{streamElapsed.toFixed(1)}ms</Badge>
              {isStreamRunning && (
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
              )}
            </>
          )}
          {!showStreamingInfo && extractionTime > 0 && (
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
                  ? "All Complete"
                  : "Has Incomplete"}
              </Badge>
            </>
          )}
        </div>
      )}

      {/* ── Stream progress bar ── */}
      {isStreamRunning && (
        <div className="flex-shrink-0 h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-100"
            style={{ width: `${streamProgress}%` }}
          />
        </div>
      )}

      {/* ── Results ── */}
      {results.length === 0 && !isStreamRunning && (
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
          Click "Extract Now" for one-shot or "Simulate Stream" for chunked
          extraction.
        </div>
      )}

      {results.length > 0 && (
        <div className="flex-1 overflow-auto space-y-2">
          {results.map((r, idx) => (
            <JsonResultCard key={idx} result={r} index={idx} />
          ))}
        </div>
      )}
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

  const jsonStr = (() => {
    try {
      return JSON.stringify(result.value, null, 2);
    } catch {
      return String(result.value);
    }
  })();

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(jsonStr).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }, [jsonStr]);

  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      {/* Header */}
      <button
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-mono">
          #{index + 1}
        </Badge>
        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
          {result.type}
        </Badge>
        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
          {result.source}
        </Badge>
        <Badge
          variant={result.isComplete ? "default" : "destructive"}
          className="text-[10px] h-4 px-1.5"
        >
          {result.isComplete ? "complete" : "incomplete"}
        </Badge>
        {result.repairApplied && (
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
            repaired
          </Badge>
        )}
        <span className="text-muted-foreground font-mono ml-auto">
          [{result.startIndex}–{result.endIndex}]
        </span>
      </button>

      {expanded && (
        <div className="border-t">
          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="px-2.5 py-1 bg-yellow-500/5 border-b text-[10px] text-yellow-700 dark:text-yellow-400">
              {result.warnings.join(" · ")}
            </div>
          )}

          {/* JSON content */}
          <div className="relative">
            <Button
              size="sm"
              variant="ghost"
              className="absolute top-1 right-1 h-5 px-1.5 text-[10px] z-10"
              onClick={handleCopy}
            >
              {copied ? (
                <CheckCircle2 className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
            <pre className="p-2.5 text-[11px] font-mono leading-snug overflow-auto max-h-80 bg-muted/20">
              {jsonStr}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

const MarkdownTester: React.FC<MarkdownTesterProps> = ({ className }) => {
  const [inputContent, setInputContent] = useState(SAMPLE_CONTENT);
  const [renderedContent, setRenderedContent] = useState(SAMPLE_CONTENT);
  const [showPreview, setShowPreview] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState("enhanced-markdown");
  const [strictServerData, setStrictServerData] = useState(false);
  const [audioModalOpen, setAudioModalOpen] = useState(false);
  const [syncScroll, setSyncScroll] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingRef = useRef(false);

  const [loadedSampleId, setLoadedSampleId] = useState<string | null>(null);
  const { loadAutosave } = useMarkdownAutosave(inputContent);

  useEffect(() => {
    loadAutosave().then((saved) => {
      if (saved) {
        setInputContent(saved);
        setRenderedContent(saved);
      }
    });
  }, [loadAutosave]);

  const handleLoadSample = useCallback((sample: MarkdownSample) => {
    setInputContent(sample.content);
    setRenderedContent(sample.content);
    setLoadedSampleId(sample.id);
  }, []);

  const handleLoadAutosave = useCallback(async () => {
    const content = await loadAutosave();
    if (content !== null) {
      setInputContent(content);
      setRenderedContent(content);
      setLoadedSampleId(null);
    }
  }, [loadAutosave]);

  // Block-processing API
  const apiConfig = useApiTestConfig({ defaultServerType: "local" });
  const [processedEvents, setProcessedEvents] = useState<TypedStreamEvent[]>(
    [],
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [rawCopied, setRawCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const rawApiDataRef = useRef<string>("");

  const copyRawApiData = useCallback(() => {
    if (!rawApiDataRef.current) return;
    navigator.clipboard.writeText(rawApiDataRef.current).catch(() => {});
    setRawCopied(true);
    setTimeout(() => setRawCopied(false), 1500);
  }, []);

  const runBlockProcessing = useCallback(
    async (mode: "json" | "stream", content: string) => {
      if (!content.trim()) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsProcessing(true);
      setProcessError(null);
      setProcessedEvents([]);
      rawApiDataRef.current = "";

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiConfig.authToken)
        headers["Authorization"] = `Bearer ${apiConfig.authToken}`;
      const body = JSON.stringify({ content });

      try {
        if (mode === "json") {
          const res = await fetch(
            `${apiConfig.baseUrl}${ENDPOINTS.blockProcessing.process}`,
            {
              method: "POST",
              headers,
              body,
              signal: controller.signal,
            },
          );
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(
              (d as any)?.detail || (d as any)?.message || `HTTP ${res.status}`,
            );
          }
          const text = await res.text();
          rawApiDataRef.current = text;
          const data = JSON.parse(text) as {
            blocks: Record<string, unknown>[];
          };
          const synthetic: TypedStreamEvent[] = data.blocks.map(
            (block, i): RenderBlockEvent => ({
              event: "render_block",
              data: {
                blockId: (block.blockId ??
                  block.block_id ??
                  `block-${i}`) as string,
                blockIndex: (block.blockIndex ??
                  block.block_index ??
                  i) as number,
                type: block.type as string,
                status: "complete",
                content: (block.content ?? null) as string | null,
                data: (block.data ?? null) as Record<string, unknown> | null,
                metadata: (block.metadata ?? {}) as Record<string, unknown>,
              },
            }),
          );
          setProcessedEvents(synthetic);
        } else {
          const res = await fetch(
            `${apiConfig.baseUrl}${ENDPOINTS.blockProcessing.processStream}`,
            {
              method: "POST",
              headers,
              body,
              signal: controller.signal,
            },
          );
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(
              (d as any)?.detail || (d as any)?.message || `HTTP ${res.status}`,
            );
          }
          const { events } = parseNdjsonStream(res, controller.signal);
          const acc: TypedStreamEvent[] = [];
          const lines: string[] = [];
          for await (const ev of events) {
            acc.push(ev);
            lines.push(JSON.stringify(ev));
            rawApiDataRef.current = lines.join("\n");
            setProcessedEvents([...acc]);
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          setProcessError(err.message);
        }
      } finally {
        abortRef.current = null;
        setIsProcessing(false);
      }
    },
    [apiConfig.authToken, apiConfig.baseUrl],
  );

  const handleTabChange = useCallback(
    (tab: string) => {
      setActiveTab(tab);
      if (tab === "json" || tab === "stream") {
        runBlockProcessing(tab, renderedContent);
      }
    },
    [renderedContent, runBlockProcessing],
  );

  const getTextarea = useCallback(() => textareaRef.current, []);

  // Auto-update effect when in auto mode
  React.useEffect(() => {
    if (isAutoMode) {
      setRenderedContent(inputContent);
    }
  }, [inputContent, isAutoMode]);

  const handleManualUpdate = useCallback(() => {
    setIsUpdating(true);
    // Small delay to show the updating state
    setTimeout(() => {
      setRenderedContent(inputContent);
      setIsUpdating(false);
    }, 100);
  }, [inputContent]);

  const toggleUpdateMode = useCallback(() => {
    const newAutoMode = !isAutoMode;
    setIsAutoMode(newAutoMode);

    // If switching to auto mode, immediately sync the content
    if (newAutoMode) {
      setRenderedContent(inputContent);
    }
  }, [isAutoMode, inputContent]);

  const handleCopyInput = useCallback(() => {
    navigator.clipboard.writeText(inputContent);
  }, [inputContent]);

  const handleClear = useCallback(() => {
    setInputContent("");
    setLoadedSampleId(null);
  }, []);

  const handleContentInserted = useCallback(() => {
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
  }, []);

  const getTextareaLineHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return 20;
    const computed = window.getComputedStyle(ta);
    return parseFloat(computed.lineHeight) || 20;
  }, []);

  const handleTextareaScroll = useCallback(() => {
    if (!syncScroll || isSyncingRef.current) return;
    const ta = textareaRef.current;
    const preview = previewScrollRef.current;
    if (!ta || !preview) return;

    isSyncingRef.current = true;

    const taMax = ta.scrollHeight - ta.clientHeight;
    const pvMax = preview.scrollHeight - preview.clientHeight;
    const lineHeight = getTextareaLineHeight();

    const paired = buildPairedCheckpoints(renderedContent, lineHeight, preview);
    if (paired && paired.textPx.length >= 2) {
      preview.scrollTop = Math.max(
        0,
        mapScroll(ta.scrollTop, paired.textPx, paired.renderPx, taMax, pvMax),
      );
    } else {
      preview.scrollTop = taMax > 0 ? (ta.scrollTop / taMax) * pvMax : 0;
    }

    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  }, [syncScroll, renderedContent, getTextareaLineHeight]);

  const handlePreviewScroll = useCallback(() => {
    if (!syncScroll || isSyncingRef.current) return;
    const ta = textareaRef.current;
    const preview = previewScrollRef.current;
    if (!ta || !preview) return;

    isSyncingRef.current = true;

    const taMax = ta.scrollHeight - ta.clientHeight;
    const pvMax = preview.scrollHeight - preview.clientHeight;
    const lineHeight = getTextareaLineHeight();

    const paired = buildPairedCheckpoints(renderedContent, lineHeight, preview);
    if (paired && paired.renderPx.length >= 2) {
      ta.scrollTop = Math.max(
        0,
        mapScroll(
          preview.scrollTop,
          paired.renderPx,
          paired.textPx,
          pvMax,
          taMax,
        ),
      );
    } else {
      ta.scrollTop = pvMax > 0 ? (preview.scrollTop / pvMax) * taMax : 0;
    }

    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  }, [syncScroll, renderedContent, getTextareaLineHeight]);

  useEffect(() => {
    const ta = textareaRef.current;
    const preview = previewScrollRef.current;
    if (!syncScroll || !ta || !preview) return;

    ta.addEventListener("scroll", handleTextareaScroll, { passive: true });
    preview.addEventListener("scroll", handlePreviewScroll, { passive: true });

    return () => {
      ta.removeEventListener("scroll", handleTextareaScroll);
      preview.removeEventListener("scroll", handlePreviewScroll);
    };
  }, [syncScroll, handleTextareaScroll, handlePreviewScroll]);

  const containerClasses = isFullScreen
    ? "fixed inset-0 z-50 bg-textured"
    : `h-dvh flex flex-col ${className || ""}`;

  // Calculate available height considering external header (assuming ~64px for typical header)
  const availableHeight = isFullScreen ? "100dvh" : "calc(100dvh - 64px)";

  return (
    <>
      {isFullScreen && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
      )}

      <div className={containerClasses} style={{ height: availableHeight }}>
        {/* Fixed Header Section */}
        <div className="flex-shrink-0 bg-textured border-b border-border px-4 py-2">
          {/* Title and Main Controls */}
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-base font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Markdown Content Tester
            </h1>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
                className="h-7 px-2"
              >
                {showPreview ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
                <span className="ml-1.5 text-xs">
                  {showPreview ? "Hide" : "Show"}
                </span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsFullScreen(!isFullScreen)}
                className="h-7 px-2"
              >
                {isFullScreen ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
                <span className="ml-1.5 text-xs">
                  {isFullScreen ? "Exit" : "Fullscreen"}
                </span>
              </Button>
            </div>
          </div>

          {/* Action Controls */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Update Mode Toggle */}
            <Button
              variant={isAutoMode ? "default" : "outline"}
              size="sm"
              onClick={toggleUpdateMode}
              className="h-7 px-2.5 text-xs"
            >
              {isAutoMode ? (
                <>
                  <Zap className="h-3.5 w-3.5 mr-1.5" />
                  Auto
                </>
              ) : (
                <>
                  <Hand className="h-3.5 w-3.5 mr-1.5" />
                  Manual
                </>
              )}
            </Button>

            {/* Manual Update Button - only show in manual mode */}
            {!isAutoMode && (
              <Button
                onClick={handleManualUpdate}
                disabled={isUpdating}
                size="sm"
                className="h-7 px-2.5 text-xs"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 mr-1.5 ${isUpdating ? "animate-spin" : ""}`}
                />
                {isUpdating ? "Updating..." : "Update"}
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyInput}
              className="h-7 px-2.5 text-xs"
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              className="h-7 px-2.5 text-xs"
            >
              Clear
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setAudioModalOpen(true)}
              className="h-7 px-2.5 text-xs"
            >
              <Volume2 className="h-3.5 w-3.5 mr-1.5" />
              Test Audio
            </Button>

            <SampleManager
              currentContent={inputContent}
              loadedSampleId={loadedSampleId}
              onLoad={handleLoadSample}
              onLoadAutosave={handleLoadAutosave}
            />

            {showPreview && activeTab === "enhanced-markdown" && (
              <div className="flex items-center gap-1.5 border rounded-md px-2 py-0.5 bg-muted/50">
                {syncScroll ? (
                  <Link className="h-3 w-3 text-primary" />
                ) : (
                  <Unlink className="h-3 w-3 text-muted-foreground" />
                )}
                <Label
                  htmlFor="sync-scroll"
                  className="text-xs cursor-pointer select-none"
                >
                  Sync Scroll
                </Label>
                <Switch
                  id="sync-scroll"
                  checked={syncScroll}
                  onCheckedChange={setSyncScroll}
                />
              </div>
            )}

            <div className="ml-auto flex items-center gap-1.5">
              <Badge variant="secondary" className="text-xs h-6">
                {inputContent.length} chars
              </Badge>
              <Badge variant="secondary" className="text-xs h-6">
                {inputContent.split("\n").length} lines
              </Badge>
            </div>
          </div>
        </div>

        {/* Main Content Area with Independent Scrolling */}
        <div
          className={`flex-1 flex gap-3 p-3 min-h-0 ${showPreview ? "" : "justify-center"}`}
        >
          {/* Input Column */}
          <div
            className={`flex flex-col min-h-0 ${showPreview ? "w-1/2" : "w-full max-w-4xl"}`}
          >
            <div className="flex items-center gap-2 mb-2 flex-shrink-0">
              <h3 className="text-sm font-medium">Input Content</h3>
              <Badge variant="outline" className="text-xs">
                Markdown/JSON
              </Badge>
            </div>

            <div className="flex-1 min-h-0 border rounded-lg bg-textured border-gray-200 dark:border-gray-700 overflow-hidden">
              <PromptEditorContextMenu
                getTextarea={getTextarea}
                onContentInserted={handleContentInserted}
                className="h-full"
              >
                <textarea
                  ref={textareaRef}
                  value={inputContent}
                  onChange={(e) => setInputContent(e.target.value)}
                  className="w-full h-full p-3 font-mono text-sm resize-none focus:outline-none bg-transparent text-gray-900 dark:text-gray-100 border-0 overflow-y-auto"
                  placeholder="Enter your markdown, JSON, or mixed content here...
                  
Right-click for content block templates!"
                  spellCheck={false}
                />
              </PromptEditorContextMenu>
            </div>
          </div>

          {/* Preview Column */}
          {showPreview && (
            <>
              <Separator orientation="vertical" className="self-stretch" />
              <div className="flex flex-col min-h-0 w-1/2">
                <div className="flex items-center gap-2 mb-2 flex-shrink-0">
                  <h3 className="text-sm font-medium">Rendered Output</h3>
                  <Tabs
                    value={activeTab}
                    onValueChange={handleTabChange}
                    className="flex-1"
                  >
                    <div className="flex items-center gap-2">
                      <TabsList className="h-7">
                        <TabsTrigger
                          value="enhanced-markdown"
                          className="text-xs h-6 px-2.5"
                        >
                          Markdown
                        </TabsTrigger>
                        <TabsTrigger
                          value="speech-text"
                          className="text-xs h-6 px-2.5"
                        >
                          Speech
                        </TabsTrigger>
                        <TabsTrigger
                          value="json"
                          className="text-xs h-6 px-2.5 flex items-center gap-1"
                        >
                          <Cpu className="h-3 w-3" />
                          JSON
                        </TabsTrigger>
                        <TabsTrigger
                          value="stream"
                          className="text-xs h-6 px-2.5 flex items-center gap-1"
                        >
                          <Waves className="h-3 w-3" />
                          Stream
                        </TabsTrigger>
                        <TabsTrigger
                          value="json-extract"
                          className="text-xs h-6 px-2.5 flex items-center gap-1"
                        >
                          <Braces className="h-3 w-3" />
                          JSON Extract
                        </TabsTrigger>
                        <TabsTrigger
                          value="analysis"
                          className="text-xs h-6 px-2.5 flex items-center gap-1"
                        >
                          <GitCompare className="h-3 w-3" />
                          Analysis
                        </TabsTrigger>
                      </TabsList>
                      {(activeTab === "json" || activeTab === "stream") && (
                        <Button
                          size="sm"
                          variant={strictServerData ? "destructive" : "outline"}
                          className="h-6 px-2 text-[10px] shrink-0 font-mono"
                          onClick={() => setStrictServerData((v) => !v)}
                          title={
                            strictServerData
                              ? "Strict mode ON — client fallback disabled"
                              : "Strict mode OFF — click to enable"
                          }
                        >
                          {strictServerData ? "STRICT" : "strict"}
                        </Button>
                      )}
                      <div className="ml-auto flex items-center gap-1.5">
                        <Badge variant="outline" className="text-xs h-5">
                          {isAutoMode ? "Auto" : "Manual"}
                        </Badge>
                      </div>
                    </div>
                  </Tabs>
                </div>

                <div className="flex-1 border rounded-lg bg-textured border-gray-200 dark:border-gray-700 min-h-0 flex flex-col overflow-hidden">
                  {activeTab === "enhanced-markdown" && (
                    <div
                      className="flex-1 overflow-auto p-3"
                      ref={previewScrollRef}
                    >
                      <MarkdownStream
                        content={renderedContent}
                        isStreamActive={false}
                        hideCopyButton={true}
                        allowFullScreenEditor={true}
                      />
                    </div>
                  )}

                  {activeTab === "speech-text" && (
                    <div className="flex-1 overflow-auto p-3">
                      <div className="flex items-center gap-2 mb-3">
                        <SpeakerGroup text={renderedContent} />
                        <Badge variant="secondary" className="text-xs">
                          {parseMarkdownToText(renderedContent).length} speech
                          chars
                        </Badge>
                      </div>
                      <div className="font-mono text-sm whitespace-pre-wrap break-words bg-textured text-gray-900 dark:text-gray-100">
                        {parseMarkdownToText(renderedContent)}
                      </div>
                    </div>
                  )}

                  {activeTab === "json" && (
                    <div className="flex-1 overflow-auto p-3">
                      {isProcessing && processedEvents.length === 0 && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Processing blocks...
                        </div>
                      )}
                      {processError && (
                        <div className="p-2 rounded bg-destructive/10 border border-destructive/20 text-xs text-destructive">
                          {processError}
                        </div>
                      )}
                      {!isProcessing &&
                        !processError &&
                        processedEvents.length === 0 && (
                          <div className="flex flex-col items-center gap-2 py-8 text-xs text-muted-foreground">
                            <p>
                              No output — click Re-run or update the content.
                            </p>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-xs"
                              onClick={() =>
                                runBlockProcessing("json", renderedContent)
                              }
                              disabled={!renderedContent.trim()}
                            >
                              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                              Re-run
                            </Button>
                          </div>
                        )}
                      {processedEvents.length > 0 && (
                        <>
                          <div className="flex justify-end gap-1 mb-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs"
                              onClick={copyRawApiData}
                            >
                              {rawCopied ? (
                                <>
                                  <CheckCircle2 className="h-3 w-3 mr-1 text-green-500" />
                                  Copied!
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3 mr-1" />
                                  Copy raw
                                </>
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs"
                              onClick={() =>
                                runBlockProcessing("json", renderedContent)
                              }
                              disabled={isProcessing || !renderedContent.trim()}
                            >
                              {isProcessing ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <RefreshCw className="h-3 w-3 mr-1" />
                              )}
                              Re-run
                            </Button>
                          </div>
                          <MarkdownStream
                            content=""
                            events={processedEvents}
                            className="bg-textured"
                            isStreamActive={false}
                            hideCopyButton={true}
                            allowFullScreenEditor={true}
                            strictServerData={strictServerData}
                          />
                        </>
                      )}
                    </div>
                  )}

                  {activeTab === "stream" && (
                    <div className="flex-1 overflow-auto p-3">
                      {isProcessing && processedEvents.length === 0 && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Streaming blocks...
                        </div>
                      )}
                      {processError && (
                        <div className="p-2 rounded bg-destructive/10 border border-destructive/20 text-xs text-destructive">
                          {processError}
                        </div>
                      )}
                      {!isProcessing &&
                        !processError &&
                        processedEvents.length === 0 && (
                          <div className="flex flex-col items-center gap-2 py-8 text-xs text-muted-foreground">
                            <p>
                              No output — click Re-run or update the content.
                            </p>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-xs"
                              onClick={() =>
                                runBlockProcessing("stream", renderedContent)
                              }
                              disabled={!renderedContent.trim()}
                            >
                              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                              Re-run
                            </Button>
                          </div>
                        )}
                      {processedEvents.length > 0 && (
                        <>
                          <div className="flex justify-end gap-1 mb-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs"
                              onClick={copyRawApiData}
                            >
                              {rawCopied ? (
                                <>
                                  <CheckCircle2 className="h-3 w-3 mr-1 text-green-500" />
                                  Copied!
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3 mr-1" />
                                  Copy raw
                                </>
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs"
                              onClick={() =>
                                runBlockProcessing("stream", renderedContent)
                              }
                              disabled={isProcessing || !renderedContent.trim()}
                            >
                              {isProcessing ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <RefreshCw className="h-3 w-3 mr-1" />
                              )}
                              Re-run
                            </Button>
                          </div>
                          <MarkdownStream
                            content=""
                            events={processedEvents}
                            className="bg-textured"
                            isStreamActive={isProcessing}
                            hideCopyButton={true}
                            allowFullScreenEditor={true}
                            strictServerData={strictServerData}
                          />
                        </>
                      )}
                    </div>
                  )}

                  {activeTab === "json-extract" && (
                    <JsonExtractionPanel content={renderedContent} />
                  )}

                  {activeTab === "analysis" && (
                    <BlockParserComparison
                      currentContent={renderedContent}
                      loadedSampleId={loadedSampleId}
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Audio Test Modal */}
      <AudioTestModal
        open={audioModalOpen}
        onOpenChange={setAudioModalOpen}
        markdownContent={renderedContent}
      />
    </>
  );
};

export default MarkdownTester;
