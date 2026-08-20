"use client";

/**
 * CopyableValue — a value whose whole purpose is to end up somewhere else
 * (a webhook URL, a one-time secret). Selectable text plus one copy button,
 * with a real receipt.
 */

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { toast } from "@/lib/toast";
import { cn } from "@/utils/cn";

export function CopyableValue({
  value,
  label,
  className,
}: {
  value: string;
  /** What was copied, for the toast: "Webhook address copied". */
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1.5",
        className,
      )}
    >
      <code className="min-w-0 flex-1 select-all break-all font-mono text-[11px] text-foreground">
        {value}
      </code>
      <button
        type="button"
        aria-label={`Copy ${label.toLowerCase()}`}
        onClick={() => {
          void navigator.clipboard
            .writeText(value)
            .then(() => {
              setCopied(true);
              toast.success(`${label} copied`);
              window.setTimeout(() => setCopied(false), 1600);
            })
            .catch(() => toast.error("Could not copy — select it and copy manually."));
        }}
        className="flex min-h-8 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-xs text-foreground"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
