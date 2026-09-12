"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";
import { SettingsRow } from "../SettingsRow";
import { cn } from "@/lib/utils";
import type { SettingsCommonProps } from "../types";

export type KeybindingValue = {
  /** Key code from KeyboardEvent.code (e.g., "KeyK", "Digit1"). */
  key: string;
  /** Display string ready to render (e.g., "⌘K", "Ctrl+Shift+P"). */
  display: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
};

export type SettingsKeybindingProps = SettingsCommonProps & {
  value: KeybindingValue | null;
  onValueChange: (value: KeybindingValue | null) => void;
  /** Allow clearing the binding. */
  clearable?: boolean;
  last?: boolean;
};

const NON_BINDING_KEYS = new Set([
  "Escape",
  "Tab",
  "Meta",
  "Control",
  "Shift",
  "Alt",
  "ContextMenu",
  "CapsLock",
]);

function formatEventAsBinding(
  e: React.KeyboardEvent<HTMLButtonElement>,
): KeybindingValue | null {
  if (NON_BINDING_KEYS.has(e.key)) return null;
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const parts: string[] = [];
  if (e.ctrlKey) parts.push(isMac ? "⌃" : "Ctrl");
  if (e.altKey) parts.push(isMac ? "⌥" : "Alt");
  if (e.shiftKey) parts.push(isMac ? "⇧" : "Shift");
  if (e.metaKey) parts.push(isMac ? "⌘" : "Meta");
  const keyDisplay =
    e.key.length === 1 ? e.key.toUpperCase() : e.key.replace(/^(Arrow|Digit)/, "");
  parts.push(keyDisplay);
  return {
    key: e.code,
    display: parts.join(isMac ? "" : "+"),
    ctrl: e.ctrlKey,
    alt: e.altKey,
    shift: e.shiftKey,
    meta: e.metaKey,
  };
}

export function SettingsKeybinding({
  value,
  onValueChange,
  clearable = true,
  last,
  ...rowProps
}: SettingsKeybindingProps) {
  const generatedId = useId().replace(/:/g, "");
  const id = rowProps.id ?? `settings-${generatedId}`;

  const [recording, setRecording] = useState(false);

  return (
    <SettingsRow {...rowProps} id={id} variant="inline" controlLayout="wide" last={last}>
      <div className="flex items-center gap-1.5">
        <button
          id={id}
          type="button"
          onClick={() => setRecording(true)}
          onBlur={() => setRecording(false)}
          onKeyDown={(e) => {
            if (!recording) return;
            if (e.key === "Escape") {
              setRecording(false);
              return;
            }
            e.preventDefault();
            const next = formatEventAsBinding(e);
            if (next) {
              onValueChange(next);
              setRecording(false);
            }
          }}
          disabled={rowProps.disabled}
          className={cn(
            "min-h-11 min-w-32 rounded-md border px-2.5 text-sm font-mono tabular-nums text-foreground shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-primary/30 sm:min-h-8",
            recording
              ? "border-primary bg-primary/5 animate-pulse"
              : "border-border bg-card hover:bg-accent/50",
            rowProps.disabled && "cursor-not-allowed opacity-50",
          )}
        >
          {recording
            ? "Press keys…"
            : value
              ? value.display
              : "Click to record"}
        </button>
        {clearable && value && !rowProps.disabled && (
          <button
            type="button"
            aria-label="Clear keybinding"
            onClick={() => onValueChange(null)}
            className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:h-8 sm:w-8"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </SettingsRow>
  );
}
