"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface VersionIdBadgeProps {
  versionId: string;
  className?: string;
  showLabel?: boolean;
}

export function VersionIdBadge({
  versionId,
  className,
  showLabel = true,
}: VersionIdBadgeProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(versionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignored — clipboard may be blocked in insecure contexts
    }
  };

  const short = versionId.slice(0, 8);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            "inline-flex items-center gap-1 h-5 px-1.5 rounded border border-border bg-muted/40 hover:bg-muted text-[0.625rem] font-mono text-muted-foreground hover:text-foreground transition-colors",
            className,
          )}
          aria-label={copied ? "Copied version ID" : "Copy version ID"}
        >
          {showLabel && <span className="opacity-60">id</span>}
          <span className="tabular-nums">{short}</span>
          {copied ? (
            <Check className="w-2.5 h-2.5 text-emerald-500" />
          ) : (
            <Copy className="w-2.5 h-2.5" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="font-mono text-xs">
        {copied ? "Copied!" : versionId}
      </TooltipContent>
    </Tooltip>
  );
}
