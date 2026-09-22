"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { formatCount } from "@ai-matrx/kit/format";
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
const COARSE_STOPS = 1_000;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function centeredRange(value: number, width: number, max: number): Range {
  const safeWidth = Math.min(Math.max(1, width), max);
  const start = clamp(Math.round(value - safeWidth / 2), 0, max - safeWidth);
  return { start, end: start + safeWidth };
}

/** A compact character-trim control with coarse and exact adjustment modes. */
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
  const disabled = safeMax === 0;
  const sliderRange = (() => {
    if (range.end <= range.start) return { start: 0, end: safeMax };

    const width = Math.min(range.end - range.start, safeMax);
    if (
      width <= 0 ||
      range.start < 0 ||
      range.end > safeMax ||
      clampedValue < range.start ||
      clampedValue > range.end
    ) {
      return width > 0
        ? centeredRange(clampedValue, width, safeMax)
        : { start: 0, end: safeMax };
    }

    return range;
  })();
  const isZoomed = sliderRange.start > 0 || sliderRange.end < safeMax;
  const sliderWidth = sliderRange.end - sliderRange.start;
  const sliderStops = Math.min(COARSE_STOPS, Math.max(1, sliderWidth));
  const sliderValue = Math.round(
    ((clampedValue - sliderRange.start) / Math.max(1, sliderWidth)) * sliderStops,
  );

  const updateExactValue = (nextValue: number) => {
    const next = clamp(Math.round(nextValue), 0, safeMax);
    if (isZoomed && (next < sliderRange.start || next > sliderRange.end)) {
      setRange(centeredRange(next, sliderWidth, safeMax));
    }
    onChange(next);
  };

  const fineTune = () => {
    const currentWidth = isZoomed ? sliderWidth : safeMax;
    if (currentWidth > FINE_WIDTH) {
      setRange(centeredRange(clampedValue, Math.ceil(currentWidth / 10), safeMax));
    }
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
      <div className={cn("matrx-touch-targets @container min-w-0", className)}>
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_8rem] items-center gap-1.5 @[600px]:grid-cols-[5rem_auto_minmax(0,1fr)_auto_7rem_auto_auto]">
          {tooltip ? (
            <Tooltip>
              <TooltipTrigger asChild>{labelElement}</TooltipTrigger>
              <TooltipContent side="top" className="z-[9999]">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          ) : (
            labelElement
          )}

          <span
            className="col-start-2 row-start-1 min-w-0 truncate text-right text-[10px] tabular-nums text-muted-foreground @[600px]:hidden"
            title={
              isZoomed
                ? `Fine range: ${sliderRange.start.toLocaleString()}–${sliderRange.end.toLocaleString()}`
                : undefined
            }
          >
            {isZoomed ? `${sliderWidth.toLocaleString()} range` : ""}
          </span>

          <IconButton
            icon={ChevronLeft}
            size="sm"
            variant="outline"
            tooltip={`Decrease ${label} by one character`}
            onClick={() => updateExactValue(clampedValue - 1)}
            disabled={disabled || clampedValue === 0}
            className="col-start-1 row-start-2 rounded-md @[600px]:col-start-2 @[600px]:row-start-1"
          />

          <SliderPrimitive.Root
            min={0}
            max={sliderStops}
            step={1}
            value={[sliderValue]}
            onValueChange={(values) => {
              const position = clamp(values[0] ?? 0, 0, sliderStops);
              // Normalization makes both pointer endpoints exact even when the
              // character range is not divisible by the number of coarse stops.
              onChange(
                clamp(
                  sliderRange.start + Math.round((position / sliderStops) * sliderWidth),
                  sliderRange.start,
                  sliderRange.end,
                ),
              );
            }}
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
              "relative col-start-2 row-start-2 flex h-11 min-w-0 touch-none select-none items-center @[600px]:col-start-3 @[600px]:row-start-1 @[600px]:h-5",
              disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
            )}
          >
            <SliderPrimitive.Track className="relative h-2 grow overflow-hidden rounded-full border border-border bg-muted">
              <SliderPrimitive.Range className="absolute h-full bg-primary" />
            </SliderPrimitive.Track>
            <SliderPrimitive.Thumb
              aria-label={`${label} slider`}
              aria-valuetext={`${formatCount(clampedValue)} characters`}
              className="block size-4 rounded-full border-2 border-background bg-primary shadow-sm transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 active:scale-110 disabled:pointer-events-none"
            />
          </SliderPrimitive.Root>

          <IconButton
            icon={ChevronRight}
            size="sm"
            variant="outline"
            tooltip={`Increase ${label} by one character`}
            onClick={() => updateExactValue(clampedValue + 1)}
            disabled={disabled || clampedValue === safeMax}
            className="col-start-3 row-start-2 rounded-md @[600px]:col-start-4 @[600px]:row-start-1"
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
            className="col-start-4 row-start-1 h-8 min-w-0 rounded-md border border-border bg-background px-2 text-base tabular-nums text-foreground outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 @[600px]:col-start-5 @[600px]:text-xs"
            aria-label={`${label} character count`}
          />

          <IconButton
            icon={ZoomOut}
            size="sm"
            variant="outline"
            tooltip="Restore the full trim range"
            onClick={() => setRange(FULL_RANGE)}
            disabled={!isZoomed}
            className="col-start-3 row-start-1 rounded-md @[600px]:col-start-7 @[600px]:row-start-1"
          />

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fineTune}
            disabled={disabled || sliderWidth <= FINE_WIDTH}
            className="col-start-4 row-start-2 h-8 justify-center gap-1 px-2 text-xs @[600px]:col-start-6 @[600px]:row-start-1"
            aria-label="Fine tune trim range"
          >
            <ZoomIn className="size-3.5" />
            <span className="hidden @[600px]:inline">
              Fine tune
            </span>
          </Button>
        </div>

        <div className="mt-1 hidden h-3 pl-[5.5rem] text-[10px] tabular-nums text-muted-foreground @[600px]:block">
          {isZoomed && (
            <span>
              Fine range: {sliderRange.start.toLocaleString()}–
              {sliderRange.end.toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
