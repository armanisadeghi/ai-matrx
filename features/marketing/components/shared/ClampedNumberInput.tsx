"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ClampedNumberInputProps = {
  id?: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  className?: string;
  onChange: (value: number) => void;
};

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
  onChange,
}: ClampedNumberInputProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = (raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = Math.min(max, Math.max(min, parsed));
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      disabled={disabled}
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
