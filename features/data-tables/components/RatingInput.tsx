/**
 * RatingInput — the star picker a `rating` column always claimed to have.
 *
 * The format declares itself as stars and renders as stars, but editing one
 * used to open a NUMBER SPINNER: the user saw ★★★☆☆, double-clicked, and got a
 * box asking them to type `3`. Direct manipulation is the entire reason a
 * rating is a rating, and the read view was already telling the truth — it was
 * only the editor that lied.
 *
 * Fully keyboard-operable, because a control reachable only by mouse is not
 * reachable by everyone: arrows adjust, digits set a value outright, 0 and
 * Backspace clear.
 */
"use client";

import { useState, type KeyboardEvent } from "react";
import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

type Props = {
  value: unknown;
  max?: number;
  /** Read-only mounts render the same stars without any interaction. */
  disabled?: boolean;
  /** Fires on every change; the caller decides when to persist. */
  onChange: (next: number | null) => void;
  /** Fires when the user has settled on a value (click, Enter, Escape). */
  onDone?: (final: number | null) => void;
  className?: string;
};

function toRating(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function RatingInput({
  value,
  max = 5,
  disabled = false,
  onChange,
  onDone,
  className,
}: Props) {
  const current = toRating(value);
  // Hover preview is local and never persisted — moving the mouse across a
  // rating must not change data, only show what a click would do.
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? current ?? 0;

  const commit = (next: number | null) => {
    onChange(next);
    onDone?.(next);
  };

  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const base = current ?? 0;

    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      onChange(Math.min(base + 1, max));
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      onChange(Math.max(base - 1, 0));
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
      e.preventDefault();
      e.stopPropagation();
      commit(null);
      return;
    }
    if (/^[1-9]$/.test(e.key)) {
      const n = Number(e.key);
      if (n <= max) {
        e.preventDefault();
        e.stopPropagation();
        commit(n);
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      commit(current);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onDone?.(current);
    }
  };

  return (
    <div
      className={cn("flex items-center gap-0.5", className)}
      role="slider"
      aria-label="Rating"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={current ?? 0}
      aria-valuetext={current === null ? "Not rated" : `${current} of ${max}`}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKey}
      onMouseLeave={() => setHover(null)}
      onClick={(e) => e.stopPropagation()}
    >
      {Array.from({ length: max }, (_, i) => {
        const position = i + 1;
        const filled = position <= shown;
        return (
          <button
            key={position}
            type="button"
            tabIndex={-1}
            disabled={disabled}
            // Clicking the star you are already on clears the rating — without
            // it there is no way back to "unrated" with the mouse alone.
            onClick={(e) => {
              e.stopPropagation();
              commit(current === position ? null : position);
            }}
            onMouseEnter={() => !disabled && setHover(position)}
            aria-label={`${position} of ${max}`}
            className={cn(
              "rounded-sm p-0.5 transition-colors",
              disabled ? "cursor-default" : "cursor-pointer",
            )}
          >
            <Star
              className={cn(
                "size-3.5",
                filled
                  ? "fill-amber-400 text-amber-500"
                  : "text-muted-foreground/40",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
