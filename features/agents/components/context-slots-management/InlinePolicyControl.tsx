"use client";

/**
 * InlinePolicyControl — the canonical three-mode inline-policy editor.
 *
 * One control + its encode/decode for the agent context-slot inline policy:
 *   null/undefined → "default" (the system 200-char threshold)
 *   0              → "never"  (always deferred behind ctx_get / retrieval)
 *   N (1..5000)    → "custom" ceiling
 *
 * Extracted so every surface that owns an inline policy — agent context slots
 * AND per-owner Custom Dictionary settings — shares ONE implementation instead
 * of forking the radio rows + clamp logic. Pure/presentational: it owns no
 * persistence, just the value shape.
 */

import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

export const INLINE_DEFAULT_CHARS = 200;
export const INLINE_HARD_CAP = 5000;

export type InlineMode = "default" | "custom" | "never";

export interface InlinePolicyValue {
  mode: InlineMode;
  /** String for the numeric input; parsed on encode. */
  customChars: string;
}

/** Decode a stored `max_inline_chars` into the three-mode UI value. */
export function decodeInlinePolicy(
  maxInlineChars: number | null | undefined,
): InlinePolicyValue {
  if (maxInlineChars === undefined || maxInlineChars === null) {
    return { mode: "default", customChars: "" };
  }
  if (maxInlineChars === 0) return { mode: "never", customChars: "" };
  return { mode: "custom", customChars: String(maxInlineChars) };
}

/** Encode the UI value back to `max_inline_chars` (null = default). */
export function encodeInlinePolicy(
  value: InlinePolicyValue,
): { maxInlineChars: number | null } | { error: string } {
  if (value.mode === "default") return { maxInlineChars: null };
  if (value.mode === "never") return { maxInlineChars: 0 };
  const raw = parseInt(value.customChars, 10);
  if (!Number.isFinite(raw) || raw <= 0) {
    return {
      error: `Custom ceiling must be a positive integer (1–${INLINE_HARD_CAP}).`,
    };
  }
  return { maxInlineChars: Math.min(raw, INLINE_HARD_CAP) };
}

function RadioRow({
  value,
  currentValue,
  label,
  description,
  right,
}: {
  value: InlineMode;
  currentValue: InlineMode;
  label: string;
  description: string;
  right?: React.ReactNode;
}) {
  const selected = value === currentValue;
  return (
    <label
      htmlFor={`inline-mode-${value}`}
      className={cn(
        "flex items-start gap-3 rounded-md border border-border p-2.5 cursor-pointer transition-colors",
        selected ? "border-primary/60 bg-accent/40" : "hover:bg-accent/20",
      )}
    >
      <RadioGroupItem
        value={value}
        id={`inline-mode-${value}`}
        className="mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground">{label}</span>
          {right}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </label>
  );
}

export function InlinePolicyControl({
  value,
  onChange,
  className,
}: {
  value: InlinePolicyValue;
  onChange: (next: InlinePolicyValue) => void;
  className?: string;
}) {
  return (
    <RadioGroup
      value={value.mode}
      onValueChange={(mode) => {
        const nextMode = mode as InlineMode;
        if (nextMode === "default")
          onChange({ mode: "default", customChars: "" });
        else if (nextMode === "never")
          onChange({ mode: "never", customChars: "" });
        else onChange({ mode: "custom", customChars: value.customChars });
      }}
      className={cn("space-y-2", className)}
    >
      <RadioRow
        value="default"
        currentValue={value.mode}
        label="Default"
        description={`Inline if content fits in ${INLINE_DEFAULT_CHARS} characters.`}
      />
      <RadioRow
        value="custom"
        currentValue={value.mode}
        label="Custom ceiling"
        description={`Inline up to N characters. Hard cap is ${INLINE_HARD_CAP}.`}
        right={
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={INLINE_HARD_CAP}
              value={value.customChars}
              onChange={(e) =>
                onChange({ mode: "custom", customChars: e.target.value })
              }
              onFocus={() => {
                if (value.mode !== "custom")
                  onChange({ mode: "custom", customChars: value.customChars });
              }}
              placeholder="800"
              className="h-8 w-24 text-sm"
              style={{ fontSize: "16px" }}
            />
            <span className="text-[11px] text-muted-foreground">chars</span>
          </div>
        }
      />
      <RadioRow
        value="never"
        currentValue={value.mode}
        label="Never inline"
        description="Always deferred — retrieved on demand, never injected inline."
      />
    </RadioGroup>
  );
}
