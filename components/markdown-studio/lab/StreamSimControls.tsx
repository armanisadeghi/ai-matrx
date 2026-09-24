// components/markdown-studio/lab/StreamSimControls.tsx
//
// The ONE control row for a simulated stream: chunk strategy, delay, chunk
// size range, run/stop, and live progress. Shared by the Markdown Studio
// preview and the admin tester's JSON-extraction simulator.

"use client";

import React from "react";
import { Loader2, Square, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  CHUNK_STRATEGIES,
  CHUNK_STRATEGY_LABELS,
  strategyUsesSizeRange,
  type ChunkStrategy,
  type StreamSimSettings,
} from "./stream-chunks";
import type { StreamSimProgress } from "./useStreamSimulation";

export interface StreamSimControlsProps {
  settings: StreamSimSettings;
  onSettingsChange: (next: StreamSimSettings) => void;
  progress: StreamSimProgress;
  onRun: () => void;
  onStop: () => void;
  disabled?: boolean;
  runLabel?: string;
  className?: string;
}

export function StreamSimControls({
  settings,
  onSettingsChange,
  progress,
  onRun,
  onStop,
  disabled,
  runLabel = "Simulate stream",
  className,
}: StreamSimControlsProps) {
  const set = (patch: Partial<StreamSimSettings>) =>
    onSettingsChange({ ...settings, ...patch });

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={settings.strategy}
          onValueChange={(v) => set({ strategy: v as ChunkStrategy })}
        >
          <SelectTrigger className="h-7 w-32 text-xs" aria-label="Chunk strategy">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHUNK_STRATEGIES.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {CHUNK_STRATEGY_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <Label className="whitespace-nowrap text-xs text-muted-foreground">
            Delay {settings.delayMs}ms
          </Label>
          <Slider
            value={[settings.delayMs]}
            onValueChange={([v]) => set({ delayMs: v })}
            min={0}
            max={200}
            step={5}
            className="w-24"
          />
        </div>

        {strategyUsesSizeRange(settings.strategy) && (
          <div className="flex items-center gap-1.5">
            <Label className="whitespace-nowrap text-xs text-muted-foreground">
              Size {settings.minChunkSize}–{settings.maxChunkSize}
            </Label>
            <Slider
              value={[settings.minChunkSize, settings.maxChunkSize]}
              onValueChange={([lo, hi]) =>
                set({ minChunkSize: lo, maxChunkSize: hi })
              }
              min={1}
              max={200}
              step={1}
              className="w-32"
            />
          </div>
        )}

        {progress.isRunning ? (
          <Button
            size="sm"
            variant="destructive"
            onClick={onStop}
            className="h-7 px-2.5 text-xs"
          >
            <Square className="mr-1 h-3 w-3" />
            Stop
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={onRun}
            className="h-7 px-2.5 text-xs"
            disabled={disabled}
          >
            <Waves className="mr-1 h-3 w-3" />
            {runLabel}
          </Button>
        )}

        {progress.totalChunks > 0 && (
          <div className="flex items-center gap-1.5 text-xs">
            <Badge variant="outline">
              {progress.chunksProcessed}/{progress.totalChunks} chunks
            </Badge>
            <Badge variant="outline">{progress.progress.toFixed(0)}%</Badge>
            <Badge variant="outline">{progress.elapsedMs.toFixed(0)}ms</Badge>
            {progress.chunksProcessed > 1 && progress.targetDelayMs > 0 && (
              <Badge
                variant="outline"
                className={cn(
                  progress.msPerChunk > progress.targetDelayMs * 1.25 &&
                    "border-amber-500/40 text-amber-700 dark:text-amber-300",
                )}
                title={
                  progress.msPerChunk > progress.targetDelayMs * 1.25
                    ? "Rendering each chunk takes longer than the configured delay, so this is the real rate."
                    : "Actual time per chunk, rendering included."
                }
              >
                {progress.msPerChunk.toFixed(0)}ms/chunk (set {progress.targetDelayMs})
              </Badge>
            )}
            {progress.isRunning && (
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
            )}
          </div>
        )}
      </div>
      {progress.isRunning && (
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-100"
            style={{ width: `${progress.progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
