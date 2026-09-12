"use client";

import { useState, useEffect, useId } from "react";
import { SettingsRow } from "../SettingsRow";
import type { SettingsCommonProps } from "../types";

export type SettingsColorPickerProps = SettingsCommonProps & {
  value: string;
  onValueChange: (value: string) => void;
  /** Small palette of preset swatches shown alongside the picker. */
  presets?: string[];
  last?: boolean;
};

function isValidHex(value: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}

export function SettingsColorPicker({
  value,
  onValueChange,
  presets,
  last,
  ...rowProps
}: SettingsColorPickerProps) {
  const generatedId = useId().replace(/:/g, "");
  const id = rowProps.id ?? `settings-${generatedId}`;

  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = (raw: string) => {
    const candidate = raw.startsWith("#") ? raw : `#${raw}`;
    if (isValidHex(candidate)) {
      onValueChange(candidate.toLowerCase());
      setDraft(candidate.toLowerCase());
    } else {
      setDraft(value);
    }
  };

  return (
    <SettingsRow {...rowProps} id={id} variant="inline" last={last}>
      <div className="flex items-center gap-1.5">
        {presets && presets.length > 0 && (
          <div className="flex items-center gap-1 mr-1.5">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                aria-label={`Set to ${p}`}
                onClick={() => onValueChange(p)}
                disabled={rowProps.disabled}
                className="h-5 w-5 rounded-md border border-border transition-transform hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: p }}
              />
            ))}
          </div>
        )}
        <label
          className="relative h-7 w-7 shrink-0 rounded-md border border-border overflow-hidden cursor-pointer"
          style={{ backgroundColor: isValidHex(value) ? value : undefined }}
        >
          <input
            id={id}
            type="color"
            value={isValidHex(value) ? value : "#000000"}
            disabled={rowProps.disabled}
            onChange={(e) => onValueChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>
        <input
          type="text"
          value={draft}
          placeholder="#000000"
          maxLength={7}
          disabled={rowProps.disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter")
              (e.currentTarget as HTMLInputElement).blur();
          }}
          className="h-7 w-24 rounded-md border border-border bg-card px-2 text-xs font-mono tabular-nums text-foreground shadow-sm transition-colors hover:bg-accent/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
    </SettingsRow>
  );
}
