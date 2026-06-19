"use client";

/**
 * Webpage drawer body — the live page fills the full height. Domain + url +
 * copy/open icons live in `WebpageFooter`; no tall header.
 */

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/lib/toast-service";
import type { ContextItemBodyProps } from "../types";

function firstUrl(item: ContextItemBodyProps["item"]): string | null {
  return item.refs.urls?.[0] ?? null;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function WebpageBody({ item, setTitle }: ContextItemBodyProps) {
  const url = firstUrl(item);

  useEffect(() => {
    if (url) setTitle?.(domainOf(url));
  }, [url, setTitle]);

  if (!url) {
    return (
      <p className="p-4 text-xs text-muted-foreground italic">
        No URL on this item.
      </p>
    );
  }

  return (
    <iframe
      src={url}
      title={url}
      className="h-full w-full bg-white"
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      referrerPolicy="no-referrer"
    />
  );
}

export function WebpageFooter({ item }: ContextItemBodyProps) {
  const url = firstUrl(item);
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
