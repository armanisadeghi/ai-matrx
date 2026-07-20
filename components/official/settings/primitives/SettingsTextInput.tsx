"use client";

import { useState, useEffect } from "react";
import { SettingsRow } from "../SettingsRow";
import type { SettingsCommonProps, SettingsControlSize } from "../types";

const sizeClass: Record<SettingsControlSize, string> = {
  sm: "h-7 text-xs px-2",
  md: "h-8 text-sm px-2.5",
  lg: "h-10 text-base px-3",
};

const widthClass = {
  sm: "w-32",
  md: "w-48",
  lg: "w-72",
  full: "w-full",
};

export type SettingsTextInputProps = SettingsCommonProps & {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "url" | "password" | "tel";
  inputMode?: "text" | "email" | "url" | "tel" | "numeric" | "decimal";
  /** Commit on blur/enter instead of every keystroke. Useful for expensive writes. */
  commitOnBlur?: boolean;
  maxLength?: number;
  size?: SettingsControlSize;
  width?: "sm" | "md" | "lg" | "full";
  /** Renders as a stacked layout so the input can be full-width. */
  stacked?: boolean;
  last?: boolean;
};

export function SettingsTextInput({
  value,
  onValueChange,
  placeholder,
  type = "text",
  inputMode,
  commitOnBlur,
  maxLength,
  size = "md",
  width = "md",
  stacked,
  last,
  ...rowProps
}: SettingsTextInputProps) {
  const id =
    rowProps.id ??
    `settings-${rowProps.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!commitOnBlur) return;
    setDraft(value);
  }, [value, commitOnBlur]);

  const effective = commitOnBlur ? draft : value;
  const effectiveWidth = stacked ? "full" : width;

  return (
    <SettingsRow
      {...rowProps}
      id={id}
      variant={stacked ? "stacked" : "inline"}
      last={last}
    >
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={effective}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={rowProps.disabled}
        onChange={(e) => {
          if (commitOnBlur) setDraft(e.target.value);
          else onValueChange(e.target.value);
        }}
        onBlur={() => {
          if (commitOnBlur && draft !== value) onValueChange(draft);
        }}
        onKeyDown={(e) => {
          if (commitOnBlur && e.key === "Enter")
            (e.currentTarget as HTMLInputElement).blur();
        }}
        className={`rounded-md border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-accent/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50 ${sizeClass[size]} ${widthClass[effectiveWidth]}`}
        style={{ fontSize: size === "lg" ? "16px" : undefined }}
      />
    </SettingsRow>
  );
}
