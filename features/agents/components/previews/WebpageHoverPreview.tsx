"use client";

/**
 * Lightweight hover preview for a webpage URL reference. No fetch — shows
 * the URL, parsed domain, and an optional pre-resolved preview/title from the
 * caller (e.g. ManagedResource.preview when the input pipeline already
 * scraped it).
 */

import { useState } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { Check, Copy, ExternalLink, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast-service";

function parseDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

interface WebpagePreviewContentProps {
  url: string;
  /** Optional pre-resolved title (from scraped content). */
  title?: string | null;
  /** Optional pre-resolved snippet/preview text. */
  snippet?: string | null;
}

export function WebpagePreviewContent({
  url,
  title,
  snippet,
}: WebpagePreviewContentProps) {
  const [copied, setCopied] = useState(false);
  const domain = parseDomain(url);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("URL copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-start gap-2">
        <Globe className="w-3.5 h-3.5 text-teal-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          {title?.trim() && (
            <div className="text-sm font-semibold text-foreground line-clamp-2">
              {title}
            </div>
          )}
          {domain && (
            <div className="text-[11px] text-muted-foreground truncate">
              {domain}
            </div>
          )}
        </div>
      </div>

      <div className="text-[10px] font-mono text-muted-foreground break-all bg-muted/40 rounded p-1.5">
        {url}
      </div>

      {snippet?.trim() && (
        <p className="text-xs text-foreground whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
          {snippet.length > 400 ? snippet.slice(0, 400).trimEnd() + "…" : snippet}
        </p>
      )}

      <div className="flex items-center gap-1.5 pt-1 border-t border-border">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs gap-1"
          onClick={handleCopyUrl}
        >
          {copied ? <Check className="text-success" /> : <Copy />}
          {copied ? "Copied" : "Copy URL"}
        </Button>
        <Button asChild size="sm" className="ml-auto h-7 px-2.5 text-xs gap-1">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink />
            Open
          </a>
        </Button>
      </div>
    </div>
  );
}

interface WebpageHoverPreviewProps {
  url: string;
  title?: string | null;
  snippet?: string | null;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  openDelay?: number;
  closeDelay?: number;
  className?: string;
}

export function WebpageHoverPreview({
  url,
  title,
  snippet,
  children,
  side = "top",
  align = "start",
  openDelay = 250,
  closeDelay = 140,
  className,
}: WebpageHoverPreviewProps) {
  return (
    <HoverCard openDelay={openDelay} closeDelay={closeDelay}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side={side}
        align={align}
        sideOffset={8}
        className={cn(
          "w-80 p-3 bg-card border border-border shadow-lg",
          className,
        )}
      >
        <WebpagePreviewContent url={url} title={title} snippet={snippet} />
      </HoverCardContent>
    </HoverCard>
  );
}
