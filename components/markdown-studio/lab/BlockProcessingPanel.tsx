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
import MarkdownStream from "@ai-matrx/chat/ui/markdown-stream/MarkdownStream";
import { requestRaw } from "@/lib/python-client";
import { getUserMessage } from "@ai-matrx/agents/matrx";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { parseNdjsonStream } from "@/lib/api/stream-parser";
import { copyContent } from "@ai-matrx/rich-content/copy/copy-commands";
import type {
  RenderBlockEvent,
  TypedStreamEvent,
} from "@ai-matrx/agents/generated/stream-events";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { asClause } from "@ai-matrx/kit/text";

export type BlockProcessingMode = "json" | "stream";

export function useBlockProcessing() {
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

    const path =
      mode === "json"
        ? ENDPOINTS.blockProcessing.process
        : ENDPOINTS.blockProcessing.processStream;

    try {
      // The host door resolves the server, adds auth + organization headers,
      // and throws a classified BackendApiError on a non-2xx.
      const res = await requestRaw(
        path,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        },
        { signal: controller.signal },
      );
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
        setError(getUserMessage(err));
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsProcessing(false);
    }
  };

  const copyRaw = () => copyContent(rawRef.current);
  const hasRaw = () => rawRef.current.length > 0;

  // The host door awaits the session token itself before sending, so the
  // panel is ready on mount.
  const isReady = true;

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
          variant={strict ? "danger" : "outline"}
          className="mr-auto"
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
            icon={rawCopied ? (
              <CheckCircle2 className="text-green-500" />
            ) : (
              <Copy />
            )}
            variant="quiet"
            onClick={() => void handleCopyRaw()}
          >
            {rawCopied ? "Copied" : "Copy raw"}
          </Button>
        )}
        <Button
          icon={isProcessing ? (
            <Loader2 className="animate-spin" />
          ) : (
            <RefreshCw />
          )}
          variant="quiet"
          onClick={rerun}
          disabled={isProcessing || !content.trim() || !isReady}
        >
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
        <div className="rounded border border-destructive/20 bg-destructive/10 p-2 text-xs text-destructive-ink">
          The block processor refused this request: {asClause(error)}. Check the server
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
