"use client";

import { Check, Copy } from "lucide-react";
import { useId, useState } from "react";
import { SettingsRow } from "../SettingsRow";
import { cn } from "@/lib/utils";
import type { SettingsCommonProps } from "../types";

export type SettingsReadOnlyValueProps = Omit<
  SettingsCommonProps,
  "disabled" | "modified"
> & {
  value: string;
  /** When true, shows a copy-to-clipboard button. */
  copyable?: boolean;
  /** Renders the value in a monospace font (for IDs, hashes, URLs). */
  mono?: boolean;
  last?: boolean;
};

/**
 * Informational row — no user control, just a key/value display.
 * Examples: "App version: 0.3.217", "Build: abc123", "User ID: uuid-...".
 */
export function SettingsReadOnlyValue({
  value,
  copyable,
  mono,
  last,
  ...rowProps
}: SettingsReadOnlyValueProps) {
  const generatedId = useId().replace(/:/g, "");
  const id = rowProps.id ?? `settings-${generatedId}`;

  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Silently ignore copy failures (browser may block in insecure contexts).
    }
  };

  return (
    <SettingsRow {...rowProps} id={id} variant="inline" controlLayout="wide" last={last}>
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "text-xs text-muted-foreground max-w-64 truncate",
            mono && "font-mono tabular-nums",
          )}
          title={value}
        >
          {value}
        </span>
        {copyable && (
          <button
            type="button"
            aria-label={copied ? "Copied" : "Copy to clipboard"}
            onClick={handleCopy}
            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        )}
      </div>
    </SettingsRow>
  );
}
