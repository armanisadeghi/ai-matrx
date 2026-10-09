"use client";

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@ai-matrx/design-system";
import { cn } from "@ai-matrx/design-system";

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
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(await copyText(versionId))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
            <Check className="w-2.5 h-2.5 text-success" />
          ) : (
            <Copy className="w-2.5 h-2.5" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {copied ? "Copied!" : versionId}
      </TooltipContent>
    </Tooltip>
  );
}
