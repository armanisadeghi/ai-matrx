"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import IconButton from "@/components/official/IconButton";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface TrimControlProps {
  label: string;
  max: number;
  value: number;
  onChange: (value: number) => void;
  tooltip?: string;
  className?: string;
}

type Range = { start: number; end: number };

const FULL_RANGE: Range = { start: 0, end: 0 };
const FINE_WIDTH = 200;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function centeredRange(value: number, width: number, max: number): Range {
  const safeWidth = Math.min(Math.max(1, width), max);
  const start = clamp(Math.round(value - safeWidth / 2), 0, max - safeWidth);
  return { start, end: start + safeWidth };
}

/**
 * A precise, bounded control for character trimming. The full slider stays
 * useful for very large content while Fine tune exposes a stable exact window.
 */
export function TrimControl({
  label,
  max,
  value,
  onChange,
  tooltip,
  className,
}: TrimControlProps) {
  const inputId = React.useId();
  const safeMax = Math.max(0, Math.floor(Number.isFinite(max) ? max : 0));
  const clampedValue = clamp(
    Math.floor(Number.isFinite(value) ? value : 0),
    0,
    safeMax,
  );
  const [range, setRange] = React.useState<Range>(FULL_RANGE);
  const isDragging = React.useRef(false);
  const disabled = safeMax === 0;
  const isZoomed = range.end > range.start;
  const sliderRange = isZoomed ? range : { start: 0, end: safeMax };
  const sliderWidth = sliderRange.end - sliderRange.start;
  const sliderStep =
    isZoomed && sliderWidth <= FINE_WIDTH
      ? 1
      : Math.max(1, Math.ceil(Math.max(1, sliderWidth) / 1000));

  React.useEffect(() => {
    setRange((current) => {
      if (current.end <= current.start) return FULL_RANGE;
      const width = Math.min(current.end - current.start, safeMax);
      if (width <= 0) return FULL_RANGE;
      return centeredRange(clampedValue, width, safeMax);
    });
  }, [safeMax]);

  React.useEffect(() => {
    if (!isZoomed || isDragging.current) return;
    if (clampedValue < range.start || clampedValue > range.end) {
      setRange(centeredRange(clampedValue, range.end - range.start, safeMax));
    }
  }, [clampedValue, isZoomed, range.end, range.start, safeMax]);

  const updateExactValue = React.useCallback(
    (nextValue: number) => {
      const next = clamp(Math.round(nextValue), 0, safeMax);
      if (isZoomed && (next < range.start || next > range.end)) {
        setRange(centeredRange(next, range.end - range.start, safeMax));
      }
      onChange(next);
    },
    [isZoomed, onChange, range.end, range.start, safeMax],
  );

  const fineTune = () => {
    const currentWidth = isZoomed ? range.end - range.start : safeMax;
    if (currentWidth <= FINE_WIDTH) return;
    setRange(centeredRange(clampedValue, Math.ceil(currentWidth / 10), safeMax));
  };

  const labelElement = (
    <span
      className={cn(
        "min-w-0 truncate text-xs font-medium tabular-nums",
        disabled ? "text-muted-foreground/60" : "text-foreground",
      )}
    >
      {label}
    </span>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          "matrx-touch-targets flex w-full min-w-0 flex-col gap-1.5",
          className,
        )}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          {tooltip ? (
            <Tooltip>
              <TooltipTrigger asChild>{labelElement}</TooltipTrigger>
              <TooltipContent side="top" className="z-[9999]">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          ) : labelElement}

          <span
            className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground"
            aria-live="polite"
          >
            {isZoomed
              ? `${sliderRange.start.toLocaleString()}–${sliderRange.end.toLocaleString()} of ${safeMax.toLocaleString()}`
              : `0–${safeMax.toLocaleString()}`}
          </span>
        </div>

        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
          <IconButton
            icon={ChevronLeft}
            size="sm"
            variant="outline"
            tooltip={`Decrease ${label} by one character`}
            onClick={() => updateExactValue(clampedValue - 1)}
            disabled={disabled || clampedValue === 0}
            className="rounded-md"
          />

          <SliderPrimitive.Root
            min={sliderRange.start}
            max={sliderRange.end || 1}
            step={sliderStep}
            value={[clampedValue]}
            onValueChange={(values) =>
              onChange(
                clamp(values[0] ?? 0, sliderRange.start, sliderRange.end),
              )
            }
            onPointerDown={() => { isDragging.current = true; }}
            onPointerUp={() => { isDragging.current = false; }}
            onPointerCancel={() => { isDragging.current = false; }}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
                event.preventDefault();
                updateExactValue(clampedValue - 1);
              } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
                event.preventDefault();
                updateExactValue(clampedValue + 1);
              } else if (event.key === "Home") {
                event.preventDefault();
                updateExactValue(0);
              } else if (event.key === "End") {
                event.preventDefault();
                updateExactValue(safeMax);
              }
            }}
            disabled={disabled}
            className={cn(
              "relative flex h-5 min-w-0 touch-none select-none items-center",
              disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
            )}
            aria-label={`${label} slider`}
          >
            <SliderPrimitive.Track className="relative h-2 grow overflow-hidden rounded-full border border-border bg-muted">
              <SliderPrimitive.Range className="absolute h-full bg-primary" />
            </SliderPrimitive.Track>
            <SliderPrimitive.Thumb className="block size-4 rounded-full border-2 border-background bg-primary shadow-sm transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 active:scale-110 disabled:pointer-events-none" />
          </SliderPrimitive.Root>

          <IconButton
            icon={ChevronRight}
            size="sm"
            variant="outline"
            tooltip={`Increase ${label} by one character`}
            onClick={() => updateExactValue(clampedValue + 1)}
            disabled={disabled || clampedValue === safeMax}
            className="rounded-md"
          />

          <label className="sr-only" htmlFor={inputId}>
            {label} character count
          </label>
          <input
            id={inputId}
            type="number"
            inputMode="numeric"
            min={0}
            max={safeMax}
            step={1}
            value={clampedValue}
            onChange={(event) => {
              const next = event.currentTarget.valueAsNumber;
              if (Number.isFinite(next)) updateExactValue(next);
            }}
            disabled={disabled}
            className="col-span-3 h-8 min-w-0 rounded-md border border-border bg-background px-2 text-base tabular-nums text-foreground outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-1 sm:w-24 sm:text-xs"
            aria-label={`${label} character count`}
          />
        </div>

        <div className="flex min-w-0 items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fineTune}
            disabled={disabled || sliderWidth <= FINE_WIDTH}
            className="h-7 min-w-0 gap-1 px-2 text-xs"
          >
            <ZoomIn className="size-3.5" />
            Fine tune
          </Button>
          {isZoomed && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRange(FULL_RANGE)}
              className="h-7 gap-1 px-2 text-xs"
            >
              <ZoomOut className="size-3.5" />
              Full range
            </Button>
          )}
          <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {clampedValue.toLocaleString()} / {safeMax.toLocaleString()}
          </span>
        </div>
      </div>
    </TooltipProvider>
  );
}
