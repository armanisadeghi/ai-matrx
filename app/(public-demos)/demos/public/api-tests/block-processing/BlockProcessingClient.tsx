"use client";

import React, { useState, useCallback, useRef } from "react";
import { parseNdjsonStream } from "@/lib/api/stream-parser";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { ApiTestConfigPanel } from "@/components/api-test-config/ApiTestConfigPanel";
import { useApiTestConfig } from "@/components/api-test-config/useApiTestConfig";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import MarkdownStream from "@/components/MarkdownStream";
import type {
  TypedStreamEvent,
  RenderBlockEvent,
} from "@/types/python-generated/stream-events";
import {
  Loader2,
  Cpu,
  Send,
  Copy,
  Trash2,
  Waves,
  FileText,
  Layers,
  Play,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

interface BlockResult {
  block_count: number;
  blocks: Record<string, unknown>[];
}

type ApiMode = "json" | "stream";
type OutputTab = "raw" | "direct" | "processed";

// ─────────────────────────────────────────────────────
// Sample content
// ─────────────────────────────────────────────────────

const SAMPLE_CONTENT = `Here is a brief overview of the topic.

\`\`\`python
def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("World"))
\`\`\`

| Model | Speed | Quality |
|-------|-------|---------|
| GPT-4 | Slow | High |
| Claude | Fast | High |

Some more text follows here with additional context.`;

// ─────────────────────────────────────────────────────
// Output tabs
// ─────────────────────────────────────────────────────

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: React.ReactNode;
}

function TabButton({ active, onClick, icon, label, badge }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 h-8 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
      )}
    >
      {icon}
      {label}
      {badge}
    </button>
  );
}

// ─────────────────────────────────────────────────────
// Main client
// ─────────────────────────────────────────────────────

export default function BlockProcessingClient() {
  const apiConfig = useApiTestConfig({ defaultServerType: "local" });

  const [content, setContent] = useState(SAMPLE_CONTENT);
  const [includeRaw, setIncludeRaw] = useState(false);
  const [apiMode, setApiMode] = useState<ApiMode>("stream");
  const [outputTab, setOutputTab] = useState<OutputTab>("raw");
  const [isRunning, setIsRunning] = useState(false);

  // JSON mode result
  const [jsonResult, setJsonResult] = useState<BlockResult | null>(null);
  // Stream mode events (raw NDJSON objects for Raw tab)
  const [rawEvents, setRawEvents] = useState<Record<string, unknown>[]>([]);
  // Typed stream events for Processed tab (what MarkdownStream.events expects)
  const [processedEvents, setProcessedEvents] = useState<TypedStreamEvent[]>(
    [],
  );

  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [strictServerData, setStrictServerData] = useState(false);

  // Replay state — re-feeds captured events one-by-one with a delay
  const [replayDelay, setReplayDelay] = useState(100);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);

  // Captured events from the last completed run (never cleared on replay)
  const capturedRawRef = useRef<Record<string, unknown>[]>([]);
  const capturedTypedRef = useRef<TypedStreamEvent[]>([]);
  const replayAbortRef = useRef<boolean>(false);

  const abortRef = useRef<AbortController | null>(null);

  const copyText = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, []);

  const handleRun = useCallback(async () => {
    if (!content.trim() || isRunning) return;
    replayAbortRef.current = true; // stop any in-progress replay
    setError(null);
    setJsonResult(null);
    setRawEvents([]);
    setProcessedEvents([]);
    setIsRunning(true);
    setIsReplaying(false);
    setReplayIndex(0);
    capturedRawRef.current = [];
    capturedTypedRef.current = [];

    const controller = new AbortController();
    abortRef.current = controller;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiConfig.authToken)
      headers["Authorization"] = `Bearer ${apiConfig.authToken}`;
    const body = JSON.stringify({ content, include_raw: includeRaw });

    try {
      if (apiMode === "json") {
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
          throw new Error(d?.detail || d?.message || `HTTP ${res.status}`);
        }
        const data: BlockResult = await res.json();
        setJsonResult(data);

        // Convert JSON blocks into synthetic render_block stream events
        // so the Processed tab can pass them to MarkdownStream.events
        const syntheticEvents: TypedStreamEvent[] = data.blocks.map(
          (block, i): RenderBlockEvent => ({
            event: "render_block",
            data: {
              blockId: (block.block_id as string) || `block-${i}`,
              blockIndex: (block.block_index as number) ?? i,
              type: block.type as string,
              status: "complete",
              content: (block.content as string) ?? null,
              data: (block.data as Record<string, unknown>) ?? null,
              metadata:
                (block.metadata as Record<string, unknown>) ?? undefined,
            },
          }),
        );
        setProcessedEvents(syntheticEvents);
      } else {
        // Stream mode — collect raw events AND build typed TypedStreamEvent[]
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
          throw new Error(d?.detail || d?.message || `HTTP ${res.status}`);
        }
        const { events } = parseNdjsonStream(res, controller.signal);
        const accRaw: Record<string, unknown>[] = [];
        const accTyped: TypedStreamEvent[] = [];

        for await (const ev of events) {
          accRaw.push(ev as unknown as Record<string, unknown>);
          accTyped.push(ev);
          setRawEvents([...accRaw]);
          setProcessedEvents([...accTyped]);
        }

        // Save full capture for replay
        capturedRawRef.current = accRaw;
        capturedTypedRef.current = accTyped;
        setReplayIndex(accTyped.length);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(err.message);
      }
    } finally {
      abortRef.current = null;
      setIsRunning(false);
    }
  }, [
    content,
    includeRaw,
    apiMode,
    apiConfig.baseUrl,
    apiConfig.authToken,
    isRunning,
  ]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleStopReplay = useCallback(() => {
    replayAbortRef.current = true;
  }, []);

  const handleReplay = useCallback(async () => {
    const raw = capturedRawRef.current;
    const typed = capturedTypedRef.current;
    if (!typed.length || isReplaying || isRunning) return;

    replayAbortRef.current = false;
    setIsReplaying(true);
    setRawEvents([]);
    setProcessedEvents([]);
    setReplayIndex(0);

    for (let i = 0; i < typed.length; i++) {
      if (replayAbortRef.current) break;
      await new Promise<void>((resolve) => setTimeout(resolve, replayDelay));
      if (replayAbortRef.current) break;
      setRawEvents(raw.slice(0, i + 1));
      setProcessedEvents(typed.slice(0, i + 1));
      setReplayIndex(i + 1);
    }

    setIsReplaying(false);
  }, [isReplaying, isRunning, replayDelay]);

  // Derive display values for Raw tab
  const rawOutputText =
    apiMode === "json" && jsonResult
      ? JSON.stringify(jsonResult, null, 2)
      : rawEvents.length > 0
        ? rawEvents.map((e) => JSON.stringify(e)).join("\n")
        : "";

  const blockCount =
    apiMode === "json"
      ? (jsonResult?.block_count ?? 0)
      : rawEvents.filter(
          (e) => (e as { event?: string }).event === "render_block",
        ).length;

  const hasOutput = rawOutputText.length > 0 || processedEvents.length > 0;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background text-sm">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border bg-card">
        <div className="flex items-center gap-2 px-4 pt-3 pb-1">
          <Cpu className="w-5 h-5 text-primary" />
          <h1 className="text-base font-bold">Block Processing Tester</h1>
          <Badge
            variant={isRunning ? "default" : "secondary"}
            className="ml-auto text-[10px]"
          >
            {isRunning ? "Processing..." : "Ready"}
          </Badge>
        </div>
        <div className="px-4 pb-2">
          <ApiTestConfigPanel config={apiConfig} />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* ── Left: input + controls ── */}
        <div className="w-[380px] flex-shrink-0 border-r border-border overflow-y-auto px-4 py-4 space-y-4">
          {/* API mode */}
          <div>
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
              API Mode
            </Label>
            <div className="flex gap-2 mt-1.5">
              <button
                onClick={() => setApiMode("json")}
                className={cn(
                  "flex-1 h-7 text-xs rounded-md border transition-colors",
                  apiMode === "json"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                JSON (one-shot)
              </button>
              <button
                onClick={() => setApiMode("stream")}
                className={cn(
                  "flex-1 h-7 text-xs rounded-md border transition-colors flex items-center justify-center gap-1",
                  apiMode === "stream"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <Waves className="w-3 h-3" />
                Stream (NDJSON)
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {apiMode === "json"
                ? "Returns all blocks at once. Processed tab simulates them as stream events."
                : "Replays render_block events live — Processed tab renders in real time."}
            </p>
          </div>

          {/* Content textarea */}
          <div>
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Content to process
            </Label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={20}
              placeholder="Paste any markdown, LLM response, or text here..."
              disabled={isRunning}
              className="mt-1 w-full text-xs resize-none rounded-md border border-input bg-background px-3 py-2 font-mono focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
              style={{ fontSize: 12 }}
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {content.length.toLocaleString()} chars
            </p>
          </div>

          {/* Options */}
          <label
            className={cn(
              "flex items-center gap-2 text-xs cursor-pointer",
              apiMode === "stream" && "text-muted-foreground/50",
            )}
          >
            <Checkbox
              id="include_raw"
              checked={includeRaw}
              disabled={isRunning || apiMode === "stream"}
              onCheckedChange={(v) => setIncludeRaw(v === true)}
              className="h-3.5 w-3.5 shrink-0"
            />
            <span>Include raw_content (JSON mode only)</span>
          </label>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              onClick={handleRun}
              disabled={!content.trim() || isRunning}
              size="sm"
              className="flex-1 h-7 text-xs"
            >
              {isRunning ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <Send className="w-3 h-3 mr-1" />
              )}
              Process
            </Button>
            {isRunning && (
              <Button
                onClick={handleStop}
                size="sm"
                variant="destructive"
                className="h-7 text-xs px-3"
              >
                Stop
              </Button>
            )}
          </div>

          {error && (
            <div className="p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        {/* ── Right: tabbed output ── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Tab bar */}
          <div className="flex-shrink-0 flex items-center gap-0 border-b border-border bg-card px-2">
            <TabButton
              active={outputTab === "raw"}
              onClick={() => setOutputTab("raw")}
              icon={<FileText className="w-3.5 h-3.5" />}
              label="Raw Output"
              badge={
                blockCount > 0 ? (
                  <Badge
                    variant="secondary"
                    className="text-[9px] px-1 py-0 h-3.5 ml-0.5"
                  >
                    {blockCount}
                  </Badge>
                ) : undefined
              }
            />
            <TabButton
              active={outputTab === "direct"}
              onClick={() => setOutputTab("direct")}
              icon={<FileText className="w-3.5 h-3.5" />}
              label="Direct Render"
            />
            <TabButton
              active={outputTab === "processed"}
              onClick={() => setOutputTab("processed")}
              icon={<Layers className="w-3.5 h-3.5" />}
              label="Processed Render"
              badge={
                isRunning && apiMode === "stream" ? (
                  <Loader2 className="w-3 h-3 animate-spin text-blue-500 ml-1" />
                ) : undefined
              }
            />

            <div className="ml-auto flex items-center gap-2 pr-1">
              {outputTab === "processed" &&
                apiMode === "stream" &&
                capturedTypedRef.current.length > 0 && (
                  <>
                    {/* Replay speed */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {replayDelay}ms
                      </span>
                      <input
                        type="range"
                        min={20}
                        max={1000}
                        step={20}
                        value={replayDelay}
                        onChange={(e) => setReplayDelay(Number(e.target.value))}
                        disabled={isReplaying}
                        className="w-16 h-1 accent-primary cursor-pointer disabled:opacity-40"
                        title="Replay delay between events"
                      />
                    </div>
                    {/* Replay / Stop replay */}
                    {isReplaying ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-6 px-2 text-[10px]"
                        onClick={handleStopReplay}
                      >
                        Stop
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[10px] gap-1"
                        onClick={handleReplay}
                        disabled={isRunning}
                        title="Replay events with delay to observe streaming behaviour"
                      >
                        <Play className="w-2.5 h-2.5" />
                        Replay
                      </Button>
                    )}
                    {/* Progress indicator */}
                    {isReplaying && (
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {replayIndex}/{capturedTypedRef.current.length}
                      </span>
                    )}
                  </>
                )}
              {outputTab === "processed" && (
                <Button
                  size="sm"
                  variant={strictServerData ? "destructive" : "outline"}
                  className="h-6 px-2 text-[10px] font-mono"
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
              <Button
                size="sm"
                variant="ghost"
                className="h-5 w-5 p-0"
                onClick={() => {
                  setJsonResult(null);
                  setRawEvents([]);
                  setProcessedEvents([]);
                  setError(null);
                }}
                disabled={isRunning || !hasOutput}
                title="Clear output"
              >
                <Trash2 className="w-3 h-3 text-muted-foreground" />
              </Button>
              {outputTab === "raw" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 w-5 p-0"
                  onClick={() => copyText(rawOutputText)}
                  disabled={!rawOutputText}
                  title="Copy raw output"
                >
                  <Copy
                    className={cn(
                      "w-3 h-3",
                      copied ? "text-green-500" : "text-muted-foreground",
                    )}
                  />
                </Button>
              )}
            </div>
          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* ── Tab 1: Raw Output ── */}
            {outputTab === "raw" && (
              <div className="p-4 h-full">
                {!rawOutputText && !isRunning && (
                  <p className="text-xs text-muted-foreground italic">
                    Click Process to see raw block output here.
                  </p>
                )}
                {isRunning && !rawOutputText && (
                  <p className="text-xs text-muted-foreground italic">
                    Waiting for response...
                  </p>
                )}
                {rawOutputText && (
                  <pre className="text-[11px] font-mono leading-relaxed text-foreground/85 whitespace-pre-wrap break-all">
                    {rawOutputText}
                  </pre>
                )}
              </div>
            )}

            {/* ── Tab 2: Direct Render ── */}
            {/* Renders input content directly via MarkdownStream — shows what the
                            current client-side parser produces. No API call needed. */}
            {outputTab === "direct" && (
              <div className="p-4">
                {!content.trim() ? (
                  <p className="text-xs text-muted-foreground italic">
                    Enter content on the left to see how MarkdownStream
                    currently renders it.
                  </p>
                ) : (
                  <>
                    <p className="text-[10px] text-muted-foreground mb-3 pb-2 border-b border-border">
                      Rendering input directly with{" "}
                      <code className="font-mono">MarkdownStream</code>{" "}
                      (client-side parser, no API).
                    </p>
                    <MarkdownStream
                      content={content}
                      isStreamActive={false}
                      hideCopyButton={false}
                      allowFullScreenEditor={false}
                    />
                  </>
                )}
              </div>
            )}

            {/* ── Tab 3: Processed Render ── */}
            {/* Renders the API response (render_block events) via MarkdownStream.events.
                            If the system works correctly, this should look identical to Tab 2. */}
            {outputTab === "processed" && (
              <div className="p-4">
                {!hasOutput && !isRunning && (
                  <p className="text-xs text-muted-foreground italic">
                    Click Process to see how MarkdownStream renders the
                    server-processed blocks. If correct, this should look
                    identical to the Direct Render tab.
                  </p>
                )}
                {(isRunning || isReplaying) && processedEvents.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">
                    {isReplaying ? "Replaying..." : "Waiting for blocks..."}
                  </p>
                )}
                {processedEvents.length > 0 && (
                  <>
                    <p className="text-[10px] text-muted-foreground mb-3 pb-2 border-b border-border flex items-center gap-2">
                      <span>
                        {isReplaying ? (
                          <>
                            Replaying — event{" "}
                            <span className="font-mono">{replayIndex}</span> /{" "}
                            <span className="font-mono">
                              {capturedTypedRef.current.length}
                            </span>{" "}
                            at{" "}
                            <span className="font-mono">{replayDelay}ms</span>{" "}
                            intervals
                          </>
                        ) : (
                          <>
                            Rendering server-processed{" "}
                            <code className="font-mono">render_block</code>{" "}
                            events via{" "}
                            <code className="font-mono">MarkdownStream</code>.{" "}
                            {
                              processedEvents.filter(
                                (e) => e.event === "render_block",
                              ).length
                            }{" "}
                            block event
                            {processedEvents.filter(
                              (e) => e.event === "render_block",
                            ).length !== 1
                              ? "s"
                              : ""}{" "}
                            received.
                          </>
                        )}
                      </span>
                      {!isReplaying &&
                        !isRunning &&
                        apiMode === "stream" &&
                        capturedTypedRef.current.length > 0 && (
                          <button
                            onClick={handleReplay}
                            className="ml-auto flex items-center gap-1 text-primary hover:underline text-[10px]"
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                            Replay at {replayDelay}ms
                          </button>
                        )}
                    </p>
                    <MarkdownStream
                      content=""
                      events={processedEvents}
                      isStreamActive={isRunning || isReplaying}
                      hideCopyButton={false}
                      allowFullScreenEditor={false}
                      strictServerData={strictServerData}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
