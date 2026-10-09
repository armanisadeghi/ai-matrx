"use client";

/**
 * CopyableUuid
 *
 * Read-only, compact UUID chip with a one-click copy action. Use this wherever
 * a UUID is technically required (debugging, audit, support) but the UUID
 * itself is meaningless to the typical user. Keep it small and secondary to
 * the name / label it identifies.
 */

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CopyableUuidProps {
  value: string | null | undefined;
  /** Short prefix shown before the id (e.g. "Agent", "Version"). */
  label?: string;
  /** When true, only show the first/last characters (e.g. `abcd…1234`). */
  truncate?: boolean;
  className?: string;
}

function shorten(uuid: string): string {
  if (uuid.length <= 13) return uuid;
  return `${uuid.slice(0, 8)}…${uuid.slice(-4)}`;
}

export function CopyableUuid({
  value,
  label,
  truncate = true,
  className,
}: CopyableUuidProps) {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const [copied, setCopied] = useState(false);

  if (!value) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-[10px] text-muted-foreground/70 font-mono",
          className,
        )}
      >
        {label && <span className="text-muted-foreground/60">{label}</span>}
        <span>—</span>
      </span>
    );
  }

  const display = truncate ? shorten(value) : value;

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!(await copyText(value))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5",
              "text-[10px] font-mono text-muted-foreground",
              "bg-muted/40 hover:bg-muted/70 transition-colors",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              className,
            )}
            aria-label={
              label
                ? `Copy ${label.toLowerCase()} id to clipboard`
                : "Copy id to clipboard"
            }
          >
            {label && (
              <span className="text-muted-foreground/60">{label}</span>
            )}
            <span>{display}</span>
            {copied ? (
              <Check className="h-3 w-3 text-emerald-500" />
            ) : (
              <Copy className="h-3 w-3 opacity-60" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="font-mono text-[11px]">
          {copied ? "Copied!" : value}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
