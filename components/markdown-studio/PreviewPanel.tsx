// components/markdown-studio/PreviewPanel.tsx
// The studio's output pane — the proving ground for rich content. Every
// view is a shared lab piece (components/markdown-studio/lab/) that the admin
// Markdown Tester renders too:
//
//   Rendered  — the content through RichDocument (the ONE engine) with the
//               same action toolkit other content surfaces get: the registry
//               bar in this pane's header, read-aloud, and the universal
//               right-click menu (Speak + Listen → summarize-then-listen).
//               "Stream" replays the content chunk-by-chunk through the same
//               renderer (chunk strategy, delay, size).
//   Blocks    — the V2 splitter's block listing.
//   Speech    — the exact text the speech pipeline reads, with playback.
//   Server    — the Python block processor (one-shot JSON or NDJSON stream).
//   JSON      — JSON extraction, one-shot or simulated stream.

"use client";

import React, { forwardRef, useEffect, useState } from "react";
import {
  Boxes,
  Braces,
  Columns3,
  Printer,
  Cpu,
  Eye,
  FileText,
  Volume2,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { runV2Parser } from "@/components/admin/markdown-tester/utils/run-v2-parser";
import { RichDocument } from "@/features/rich-document/RichDocument";
import { RichDocumentActionSurface } from "@/features/rich-document/RichDocumentActionSurface";
import type {
  ContentSource,
  RichDocumentActionsProp,
} from "@/features/rich-document/types";
import { getBlockTypeStyle } from "./block-type-colors";
import { StreamSimControls } from "./lab/StreamSimControls";
import {
  DEFAULT_STREAM_SIM_SETTINGS,
  type StreamSimSettings,
} from "./lab/stream-chunks";
import {
  progressForText,
  useStreamSimulation,
} from "./lab/useStreamSimulation";
import { SpeechTextPanel } from "./lab/SpeechTextPanel";
import {
  BlockProcessingPanel,
  type BlockProcessingMode,
} from "./lab/BlockProcessingPanel";
import { JsonExtractionPanel } from "./lab/JsonExtractionPanel";
import { LevelCompareView } from "./lab/LevelCompareView";
import { PrintPreviewView } from "./lab/PrintPreviewView";
import { DocumentPropertiesPanel } from "@/components/markdown-core/syntax/elements/DocumentPropertiesPanel";
import { MarkdownSourceEditProvider } from "@/components/markdown-core/syntax/elements/MarkdownSourceEdit";

/** Task checkboxes toggle in the preview only when the buffer can be saved to. */
function MaybeSourceEdit({
  source,
  save,
  children,
}: {
  source: string;
  save?: (next: string) => void;
  children: React.ReactNode;
}) {
  if (!save) return <>{children}</>;
  return (
    <MarkdownSourceEditProvider source={source} save={save}>
      {children}
    </MarkdownSourceEditProvider>
  );
}

export const PREVIEW_MODES = [
  "rendered",
  "blocks",
  "speech",
  "server",
  "json",
  "levels",
  "print",
] as const;
export type PreviewMode = (typeof PREVIEW_MODES)[number];

const MODE_META: Record<PreviewMode, { label: string; icon: LucideIcon }> = {
  rendered: { label: "Rendered", icon: FileText },
  blocks: { label: "Blocks", icon: Boxes },
  speech: { label: "Speech", icon: Volume2 },
  server: { label: "Server", icon: Cpu },
  json: { label: "JSON", icon: Braces },
  levels: { label: "Levels", icon: Columns3 },
  print: { label: "Print", icon: Printer },
};

export const STUDIO_ACTION_SURFACE_ID = "markdown-studio-preview";

interface PreviewPanelProps {
  content: string;
  /** What the content IS — drives which actions apply. Raw when typed. */
  contentSource: ContentSource;
  /**
   * The source's own action configuration (a chat message's comes from the
   * same builder the /chat bars use). Every action the source supports is
   * live here — write-back ones act on the real record, seeded from it.
   */
  sourceActions?: RichDocumentActionsProp;
  mode: PreviewMode;
  onModeChange: (mode: PreviewMode) => void;
  /** Document title for the print preview / print window. */
  title?: string;
  /**
   * The editable source's save path. When given, interactive constructs in
   * the preview (task checkboxes) write back through the splice API.
   */
  onContentChange?: (next: string) => void;
}

export const PreviewPanel = forwardRef<HTMLDivElement, PreviewPanelProps>(
  function PreviewPanel(
    { content, contentSource, sourceActions, mode, onModeChange, title, onContentChange },
    ref,
  ) {
    const [serverMode, setServerMode] = useState<BlockProcessingMode>("stream");
    const [showStreamControls, setShowStreamControls] = useState(false);
    const [simSettings, setSimSettings] = useState<StreamSimSettings>(
      DEFAULT_STREAM_SIM_SETTINGS,
    );
    // Non-null while a replay owns the rendered view.
    const [replayText, setStreamText] = useState<string | null>(null);
    const sim = useStreamSimulation();
    // Replay state describes ONLY the buffer it streamed: new content (a load,
    // an edit) drops the old run's partial text and stats (RC-B1 verify D4).
    const simProgress = progressForText(sim, content);
    const streamText = simProgress === sim ? replayText : null;
    const isReplaying = sim.isRunning && simProgress === sim;

    // A run whose buffer was replaced underneath it stops.
    useEffect(() => {
      if (sim.isRunning && sim.text !== content) sim.stop();
    }, [content, sim]);

    const hasContent = content.trim().length > 0;
    const blocks = mode === "blocks" && hasContent ? runV2Parser(content) : [];
    const renderedText = streamText ?? content;

    const runReplay = () => {
      setStreamText("");
      void sim.run(content, simSettings, {
        onChunk: (_chunk, acc) => setStreamText(acc),
        onComplete: () => setStreamText(null),
        onStopped: (acc) => setStreamText(acc),
      });
    };

    const endReplay = () => {
      sim.reset();
      setStreamText(null);
    };

    return (
      <div className="@container flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card/30">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5">
          <div className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-md border border-border bg-background/40 p-0.5">
            {PREVIEW_MODES.map((m) => {
              const Icon = MODE_META[m].icon;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => onModeChange(m)}
                  aria-label={MODE_META[m].label}
                  title={MODE_META[m].label}
                  className={cn(
                    "inline-flex min-h-11 min-w-11 items-center justify-center gap-1 whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium transition-colors lg:min-h-0 lg:min-w-0",
                    mode === m
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3 w-3 shrink-0" />
                  {/* A narrow pane (a phone, or the half-width desktop split):
                      inactive tabs go icon-only, the active one stays named.
                      Measured on the PANE (container query), not the screen. */}
                  <span className={cn(mode !== m && "hidden @xl:inline")}>
                    {MODE_META[m].label}
                  </span>
                </button>
              );
            })}
          </div>

          {mode === "rendered" && (
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowStreamControls((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                  showStreamControls || streamText !== null
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title="Replay this content as a stream"
                aria-label="Replay this content as a stream"
              >
                <Waves className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Stream</span>
              </button>
              <RichDocumentActionSurface
                surfaceId={STUDIO_ACTION_SURFACE_ID}
                variant="bar"
                fallback={null}
              />
            </div>
          )}

          {mode === "server" && (
            <div className="ml-auto flex items-center gap-0.5 rounded-md border border-border bg-background/40 p-0.5">
              {(["stream", "json"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setServerMode(m)}
                  className={cn(
                    "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                    serverMode === m
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m === "stream" ? "Stream" : "One-shot"}
                </button>
              ))}
            </div>
          )}
        </div>

        {mode === "rendered" && (showStreamControls || streamText !== null) && (
          <div className="flex items-start gap-2 border-b border-border bg-muted/20 px-3 py-2">
            <StreamSimControls
              className="flex-1"
              settings={simSettings}
              onSettingsChange={setSimSettings}
              progress={simProgress}
              onRun={runReplay}
              onStop={sim.stop}
              disabled={!hasContent}
              runLabel="Replay as stream"
            />
            {streamText !== null && !isReplaying && (
              <button
                type="button"
                onClick={endReplay}
                className="shrink-0 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                Show full
              </button>
            )}
          </div>
        )}

        {mode === "rendered" &&
          (hasContent ? (
            <div ref={ref} className="flex-1 overflow-auto p-4" data-matrx-doc-root="">
              <DocumentPropertiesPanel source={renderedText} className="mb-3" />
              <MaybeSourceEdit source={content} save={isReplaying ? undefined : onContentChange}>
                <RichDocument imagePolicy="self"
                  content={renderedText}
                  isStreamActive={isReplaying}
                  source={contentSource}
                  actionsVariant="remote"
                  actionsSurfaceId={STUDIO_ACTION_SURFACE_ID}
                  actions={sourceActions}
                  enableContextMenu
                  hideCopyButton
                  allowFullScreenEditor={false}
                />
              </MaybeSourceEdit>
            </div>
          ) : (
            <PreviewEmptyState />
          ))}

        {mode === "blocks" && (
          <div className="flex-1 space-y-2 overflow-auto p-3">
            {blocks.length === 0 ? (
              <PreviewEmptyState />
            ) : (
              blocks.map((block, idx) => {
                const style = getBlockTypeStyle(block.type);
                return (
                  <div
                    key={idx}
                    className={cn(
                      "rounded-md border bg-background/40 px-3 py-2",
                      style.border,
                    )}
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <Badge variant="outline" className="h-4 px-1.5 font-mono text-[10px]">
                        #{idx}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          "h-4 px-1.5 text-[10px] font-medium",
                          style.bg,
                          style.text,
                          style.border,
                        )}
                      >
                        {block.type}
                      </Badge>
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        {(block.content ?? "").length} chars
                      </span>
                    </div>
                    <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-muted-foreground">
                      {(block.content ?? "").slice(0, 400)}
                      {(block.content ?? "").length > 400 ? "…" : ""}
                    </pre>
                  </div>
                );
              })
            )}
          </div>
        )}

        {mode === "speech" && <SpeechTextPanel content={content} />}

        {mode === "server" && (
          <BlockProcessingPanel mode={serverMode} content={content} />
        )}

        {mode === "json" && <JsonExtractionPanel content={content} />}

        {mode === "levels" && <LevelCompareView content={content} />}

        {mode === "print" && (
          <PrintPreviewView content={content} title={title ?? "Markdown"} />
        )}
      </div>
    );
  },
);

function PreviewEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <div className="rounded-full bg-muted/40 p-3">
        <Eye className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">Live preview waiting</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Type on the left, open real content, or load a template — the
          rendered output appears here.
        </p>
      </div>
    </div>
  );
}
