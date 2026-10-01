"use client";

// The ONE integer field (moved from features/marketing/components/shared,
// 2026-10-01). A number field bound straight to a number state paints "04":
// clearing it parses to 0, the next keystroke makes the DOM value "04", and
// React leaves it because "04" == 4 (verify-6 #3, flashcards "Number of
// cards"). This keeps a text draft while typing and clamps on blur or Enter,
// so the field can go empty and never shows a leading zero.

import { useEffect, useState } from "react";
import { Input } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";

type ClampedNumberInputProps = {
  id?: string;
  value: number;
  min: number;
  /** Omit while the ceiling is still being read. */
  max?: number | null;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  onChange: (value: number) => void;
};

/** The committed value for a typed draft, or null to restore the last value. */
export function clampDraft(raw: string, min: number, max?: number | null): number | null {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return null;
  const floored = Math.max(min, parsed);
  return max === undefined || max === null ? floored : Math.min(max, floored);
}

/**
 * Controlled integer input that lets the field go empty while typing.
 * Clamp / restore happens on blur or Enter — never mid-keystroke.
 */
export function ClampedNumberInput({
  id,
  value,
  min,
  max,
  disabled,
  className,
  "aria-label": ariaLabel,
  onChange,
}: ClampedNumberInputProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = (raw: string) => {
    const next = clampDraft(raw, min, max);
    if (next === null) {
      setDraft(String(value));
      return;
    }
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max ?? undefined}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn("h-8", className)}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => commit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
    />
  );
}
