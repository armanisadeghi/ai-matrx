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
  /** Fractional values (ratios, prices). Integers by default. */
  decimal?: boolean;
  /** HTML step; defaults to 1 for integers and "any" for decimals. */
  step?: number | "any";
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "data-testid"?: string;
  title?: string;
  onChange: (value: number) => void;
  /**
   * The number the field shows right now when it is a value it would keep as typed, else null
   * (empty, or out of range until blur clamps it). A label that repeats the count ("Make 5
   * cards") reads this, so it never names a number the field does not show (verify-7 #3).
   */
  onDraftChange?: (shown: number | null) => void;
};

/** The number a draft shows when it is exactly a value the field would keep, else null. */
export function shownDraft(raw: string, min: number, max?: number | null, decimal = false): number | null {
  const next = clampDraft(raw, min, max, decimal);
  if (next === null) return null;
  return String(next) === raw.replace(/^0+(?=\d)/, "") ? next : null;
}

/** The committed value for a typed draft, or null to restore the last value. */
export function clampDraft(
  raw: string,
  min: number,
  max?: number | null,
  decimal = false,
): number | null {
  const parsed = decimal ? Number.parseFloat(raw) : Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return null;
  const floored = Math.max(min, parsed);
  return max === undefined || max === null ? floored : Math.min(max, floored);
}

/**
 * Controlled integer input that lets the field go empty while typing. An
 * in-range number commits as it is typed; clamp / restore of anything else
 * happens on blur or Enter — never mid-keystroke.
 */
export function ClampedNumberInput({
  id,
  value,
  min,
  max,
  decimal = false,
  step,
  disabled,
  className,
  "aria-label": ariaLabel,
  "data-testid": testId,
  title,
  onChange,
  onDraftChange,
}: ClampedNumberInputProps) {
  const [draft, setDraftState] = useState(String(value));
  // Reported in the same event as the keystroke, so a label repeating the count is never one
  // render behind the field.
  const setDraft = (raw: string) => {
    setDraftState(raw);
    onDraftChange?.(shownDraft(raw, min, max, decimal));
  };

  useEffect(() => {
    setDraftState(String(value));
    onDraftChange?.(shownDraft(String(value), min, max, decimal));
  }, [value, min, max, decimal, onDraftChange]);

  const commit = (raw: string) => {
    const next = clampDraft(raw, min, max, decimal);
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
      inputMode={decimal ? "decimal" : "numeric"}
      step={step ?? (decimal ? "any" : 1)}
      min={min}
      max={max ?? undefined}
      disabled={disabled}
      aria-label={ariaLabel}
      data-testid={testId}
      title={title}
      className={cn("h-8", className)}
      value={draft}
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);
        // An in-range value is the value now (a "Make 10 cards" button must
        // not lag the field until blur); anything else waits for blur.
        const next = shownDraft(raw, min, max, decimal);
        if (next !== null && next !== value) onChange(next);
      }}
      onBlur={(event) => commit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
    />
  );
}
