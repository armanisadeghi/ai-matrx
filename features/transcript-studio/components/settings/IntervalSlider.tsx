"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";

interface IntervalSliderProps {
  label: string;
  description?: string;
  /** Current value in ms. */
  valueMs: number;
  minMs: number;
  maxMs: number;
  /** Step in ms. Defaults to 1000 (1s). */
  stepMs?: number;
  onChange: (next: number) => void;
  /** Optional reset to default. When omitted, no reset link is shown. */
  defaultMs?: number;
}

function formatInterval(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const min = Math.floor(ms / 60_000);
  const remSec = Math.round((ms - min * 60_000) / 1000);
  return remSec === 0 ? `${min}m` : `${min}m ${remSec}s`;
}

export function IntervalSlider({
  label,
  description,
  valueMs,
  minMs,
  maxMs,
  stepMs = 1000,
  onChange,
  defaultMs,
}: IntervalSliderProps) {
  const id = useId();
  const isDefault = defaultMs !== undefined && valueMs === defaultMs;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[11px] font-medium text-foreground">
          {label}
        </label>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatInterval(valueMs)}
        </span>
      </div>
      <Slider
        id={id}
        min={minMs}
        max={maxMs}
        step={stepMs}
        value={[valueMs]}
        onValueChange={([v]) => onChange(v)}
        className="w-full"
      />
      <div className="flex items-center justify-between text-[10px] text-muted-foreground/70">
        <span>{formatInterval(minMs)}</span>
        {description && (
          <span className="line-clamp-1 text-[10px] text-muted-foreground/80">
            {description}
          </span>
        )}
        <span>{formatInterval(maxMs)}</span>
      </div>
      {defaultMs !== undefined && !isDefault && (
        <button
          type="button"
          onClick={() => onChange(defaultMs)}
          className="self-end text-[10px] text-primary underline-offset-2 hover:underline"
        >
          Reset to default ({formatInterval(defaultMs)})
        </button>
      )}
    </div>
  );
}
