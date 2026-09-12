"use client";

import { useState, useEffect, useId } from "react";
import { SettingsRow } from "../SettingsRow";
import type { SettingsCommonProps, SettingsControlSize } from "../types";

const sizeClass: Record<SettingsControlSize, string> = {
  sm: "h-7 text-xs px-2",
  md: "h-8 text-sm px-2.5",
  lg: "h-10 text-base px-3",
};

export type SettingsNumberInputProps = SettingsCommonProps & {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** When true, integers only. */
  integer?: boolean;
  unit?: string;
  size?: SettingsControlSize;
  width?: "sm" | "md" | "lg";
  last?: boolean;
};

const widthClass = {
  sm: "w-20",
  md: "w-24",
  lg: "w-32",
};

export function SettingsNumberInput({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  integer,
  unit,
  size = "md",
  width = "sm",
  last,
  ...rowProps
}: SettingsNumberInputProps) {
  const generatedId = useId().replace(/:/g, "");
  const id = rowProps.id ?? `settings-${generatedId}`;

  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = (raw: string) => {
    const parsed = integer ? parseInt(raw, 10) : parseFloat(raw);
    if (Number.isNaN(parsed)) {
      setDraft(String(value));
      return;
    }
    let next = parsed;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    onValueChange(next);
    setDraft(String(next));
  };

  return (
    <SettingsRow {...rowProps} id={id} variant="inline" controlLayout="wide" last={last}>
      <div className="flex items-center gap-1.5">
        <input
          id={id}
          type="number"
          inputMode={integer ? "numeric" : "decimal"}
          value={draft}
          min={min}
          max={max}
          step={step}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
          }}
          disabled={rowProps.disabled}
          className={`rounded-md border border-border bg-card text-foreground shadow-sm tabular-nums transition-colors hover:bg-accent/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50 ${sizeClass[size]} ${widthClass[width]}`}
          style={{ fontSize: size === "lg" ? "16px" : undefined }}
        />
        {unit && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {unit}
          </span>
        )}
      </div>
    </SettingsRow>
  );
}
