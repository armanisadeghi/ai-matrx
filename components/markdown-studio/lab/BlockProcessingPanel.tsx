// components/markdown-studio/lab/BlockProcessingPanel.tsx
//
// Server block processing — sends the content to the Python block
// processor (one-shot JSON or NDJSON stream) and renders the returned
// render_block events through the ONE pipeline (MarkdownStream `events`).
// Extracted from the admin Markdown Tester (2026-09-23, RC-B1).

"use client";

import React, { useEffect, useEffectEvent, useRef, useState } from "react";
import { CheckCircle2, Copy, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import MarkdownStream from "@/components/MarkdownStream";
import { useApiTestConfig } from "@/components/api-test-config/useApiTestConfig";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { parseNdjsonStream } from "@/lib/api/stream-parser";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { isJsonObject } from "@/types/json";
import type {
  RenderBlockEvent,
  TypedStreamEvent,
} from "@/types/python-generated/stream-events";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export type BlockProcessingMode = "json" | "stream";

// Narrow an unknown error-response body (FastAPI-style `{detail}` or `{message}`).
function extractApiErrorMessage(body: unknown, fallback: string): string {
  if (isJsonObject(body)) {
    if (typeof body.detail === "string") return body.detail;
    if (typeof body.message === "string") return body.message;
  }
  return fallback;
}

export function useBlockProcessing() {
  const apiConfig = useApiTestConfig({ defaultServerType: "local" });
  const [events, setEvents] = useState<TypedStreamEvent[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const rawRef = useRef("");

  const run = async (mode: BlockProcessingMode, content: string) => {
    if (!content.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsProcessing(true);
    setError(null);
    setEvents([]);
    rawRef.current = "";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      // Authorization + X-Organization-Id organization admission.
      ...apiConfig.authHeaders,
    };
    const body = JSON.stringify({ content });
    const url = `${apiConfig.baseUrl}${
      mode === "json"
        ? ENDPOINTS.blockProcessing.process
        : ENDPOINTS.blockProcessing.processStream
    }`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
      if (!res.ok) {
        const d: unknown = await res.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(d, `HTTP ${res.status}`));
      }
      if (mode === "json") {
        const text = await res.text();
        rawRef.current = text;
        const data = JSON.parse(text) as { blocks: Record<string, unknown>[] };
        setEvents(
          data.blocks.map(
            (block, i): RenderBlockEvent => ({
              event: "render_block",
              data: {
                blockId: (block.blockId ?? block.block_id ?? `block-${i}`) as string,
                blockIndex: (block.blockIndex ?? block.block_index ?? i) as number,
                type: block.type as string,
                status: "complete",
                content: (block.content ?? null) as string | null,
                data: (block.data ?? null) as Record<string, unknown> | null,
                metadata: (block.metadata ?? {}) as Record<string, unknown>,
              },
            }),
          ),
        );
      } else {
        const { events: stream } = parseNdjsonStream(res, controller.signal);
        const acc: TypedStreamEvent[] = [];
        const lines: string[] = [];
        for await (const ev of stream) {
          acc.push(ev);
          lines.push(JSON.stringify(ev));
          rawRef.current = lines.join("\n");
          setEvents([...acc]);
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(err.message);
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsProcessing(false);
    }
  };

  const copyRaw = () => copyToClipboard(rawRef.current);
  const hasRaw = () => rawRef.current.length > 0;

  // The session token loads asynchronously after mount; a request sent before
  // it lands leaves unauthenticated and is refused.
  const isReady = Boolean(apiConfig.authToken);

  return { events, isProcessing, error, run, copyRaw, hasRaw, isReady };
}

export interface BlockProcessingPanelProps {
  mode: BlockProcessingMode;
  content: string;
  /** Run once on mount / mode change. Default true. */
  autoRun?: boolean;
}

export function BlockProcessingPanel({
  mode,
  content,
  autoRun = true,
}: BlockProcessingPanelProps) {
  const { events, isProcessing, error, run, copyRaw, hasRaw, isReady } =
    useBlockProcessing();
  const [strict, setStrict] = useState(false);
  const [rawCopied, setRawCopied] = useState(false);

  // Fire once per mode switch (the tab change is the user's request), as soon
  // as the session token is ready. Content edits never auto-refire a server
  // call — Re-run does.
  const runForModeSwitch = useEffectEvent(() => {
    if (autoRun) void run(mode, content);
  });
  useEffect(() => {
    if (isReady) runForModeSwitch();
  }, [mode, isReady]);

  const handleCopyRaw = async () => {
    if (!hasRaw()) return;
    await copyRaw();
    setRawCopied(true);
    setTimeout(() => setRawCopied(false), 1500);
  };

  const rerun = () => void run(mode, content);

  return (
    <div className="flex-1 overflow-auto p-3">
      <div className="mb-2 flex items-center justify-end gap-1">
        <Button
          size="sm"
          variant={strict ? "destructive" : "outline"}
          className="mr-auto h-6 px-2 font-mono text-[10px]"
          onClick={() => setStrict((v) => !v)}
          title={
            strict
              ? "Strict mode on — client fallback disabled"
              : "Strict mode off — click to disable the client fallback"
          }
        >
          {strict ? "STRICT" : "strict"}
        </Button>
        {events.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() => void handleCopyRaw()}
          >
            {rawCopied ? (
              <CheckCircle2 className="mr-1 h-3 w-3 text-green-500" />
            ) : (
              <Copy className="mr-1 h-3 w-3" />
            )}
            {rawCopied ? "Copied" : "Copy raw"}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={rerun}
          disabled={isProcessing || !content.trim() || !isReady}
        >
          {isProcessing ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-3 w-3" />
          )}
          {events.length > 0 ? "Re-run" : "Run"}
        </Button>
      </div>

      {isProcessing && events.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {mode === "stream" ? "Streaming blocks from the server…" : "Processing blocks on the server…"}
        </div>
      )}
      {error && (
        <div className="rounded border border-destructive/20 bg-destructive/10 p-2 text-xs text-destructive">
          The block processor refused this request: {error}. Check the server
          selection in the API test config, then Re-run.
          <ErrorAlchemyMenu />
        </div>
      )}
      {!isProcessing && !error && events.length === 0 && (
        <p className="py-8 text-center text-xs text-muted-foreground">
          {content.trim()
            ? "No server output yet — press Run."
            : "Nothing to process — load or type content first."}
        </p>
      )}
      {events.length > 0 && (
        <MarkdownStream imagePolicy="self"
          content=""
          events={events}
          className="bg-textured"
          isStreamActive={mode === "stream" && isProcessing}
          hideCopyButton={true}
          allowFullScreenEditor={true}
          strictServerData={strict}
        />
      )}
    </div>
  );
}
