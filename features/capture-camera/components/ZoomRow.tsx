"use client";

/**
 * ZoomRow — the iPhone zoom pills floating over the bottom of the feed:
 * small translucent circles, the active factor in a slightly larger circle
 * with yellow text and an "×" suffix. Rendered ONLY when the host reports a
 * real zoom range (track capabilities) — we never fake unsupported zoom.
 *
 * Package source (`@ai-matrx/capture`) — presentational only.
 */

import React from "react";
import { cn } from "@/lib/utils";

export interface ZoomRowProps {
  /** Available zoom factors in ascending order (e.g. [1, 2, 4]). */
  options: number[];
  /** The currently applied factor (nearest option is highlighted). */
  value: number;
  onSelect: (factor: number) => void;
}

function formatFactor(factor: number): string {
  return factor < 1
    ? `.${String(Math.round(factor * 10))}`
    : String(Math.round(factor * 10) / 10);
}

export function ZoomRow({ options, value, onSelect }: ZoomRowProps) {
  if (options.length < 2) return null;
  const active = options.reduce((best, opt) =>
    Math.abs(opt - value) < Math.abs(best - value) ? opt : best,
  );
  return (
    <div className="flex items-center justify-center gap-3">
      {options.map((opt) => {
        const isActive = opt === active;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onSelect(opt)}
            aria-label={`Zoom ${formatFactor(opt)}x`}
            aria-pressed={isActive}
            className={cn(
              "flex touch-manipulation items-center justify-center rounded-full font-semibold transition-all duration-200",
              isActive
                ? "h-10 w-10 bg-black/45 text-[13px] text-[#FFCC00]"
                : "h-8 w-8 bg-black/35 text-[12px] text-white",
            )}
          >
            {formatFactor(opt)}
            {isActive && <span className="text-[10px]">×</span>}
          </button>
        );
      })}
    </div>
  );
}
