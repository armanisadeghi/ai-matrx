"use client";

/** The exact submitted webpage snapshot. The live page is never the truth. */

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/lib/toast-service";
import { WebpageSnapshotView } from "@/features/resource-manager/webpage/WebpageSnapshotView";
import {
  webpageTitle,
  webpageUrl,
} from "@/features/resource-manager/webpage/webpage-snapshot";
import type { ContextItemBodyProps } from "../types";

function firstWebpage(item: ContextItemBodyProps["item"]) {
  return item.refs.webpages?.[0] ?? null;
}

export function WebpageBody({ item, setTitle }: ContextItemBodyProps) {
  const webpage = firstWebpage(item);

  useEffect(() => {
    if (webpage) setTitle?.(webpageTitle(webpage));
  }, [webpage, setTitle]);

  if (!webpage) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-xs italic text-muted-foreground">
        This attachment is malformed and has no webpage URL or saved text.
      </div>
    );
  }

  if (typeof webpage === "string") {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-2">
          <p className="text-sm font-medium text-foreground">No saved text for this older attachment</p>
          <p className="text-xs text-muted-foreground">
            The message preserved the source link, but it predates webpage snapshots.
          </p>
        </div>
      </div>
    );
  }

  return <WebpageSnapshotView snapshot={webpage} />;
}

export function WebpageFooter({ item }: ContextItemBodyProps) {
  const webpage = firstWebpage(item);
  const url = webpage ? webpageUrl(webpage) : null;
  const [copied, setCopied] = useState(false);
  if (!url) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <>
      <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
        {url}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={copy}
            aria-label="Copy webpage URL"
            className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-success" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>Copy URL</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open webpage in a new tab"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </TooltipTrigger>
        <TooltipContent>Open in new tab</TooltipContent>
      </Tooltip>
    </>
  );
}
