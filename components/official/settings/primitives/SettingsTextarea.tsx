"use client";

import { useState, useEffect } from "react";
import { SettingsRow } from "../SettingsRow";
import type { SettingsCommonProps } from "../types";
import { ProTextarea } from "@/components/official/ProTextarea";

export type SettingsTextareaProps = SettingsCommonProps & {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  /** Commit on blur/enter instead of every keystroke. */
  commitOnBlur?: boolean;
  /** Show character count "N/max" at the bottom right. Requires maxLength. */
  showCount?: boolean;
  last?: boolean;
};

export function SettingsTextarea({
  value,
  onValueChange,
  placeholder,
  rows = 3,
  maxLength,
  commitOnBlur,
  showCount,
  last,
  ...rowProps
}: SettingsTextareaProps) {
  const id =
    rowProps.id ??
    `settings-${rowProps.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!commitOnBlur) return;
    setDraft(value);
  }, [value, commitOnBlur]);

  const effective = commitOnBlur ? draft : value;

  return (
    <SettingsRow {...rowProps} id={id} variant="stacked" last={last}>
      <div className="relative">
        <ProTextarea
          id={id}
          rows={rows}
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
          className="w-full rounded-md border border-border bg-card text-sm text-foreground shadow-sm px-3 py-2 leading-relaxed transition-colors hover:bg-accent/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
          style={{ fontSize: "16px" }}
        />
        {showCount && maxLength && (
          <div className="mt-1 text-right text-[11px] text-muted-foreground tabular-nums">
            {effective.length} / {maxLength}
          </div>
        )}
      </div>
    </SettingsRow>
  );
}
