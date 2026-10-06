"use client";

/** The exact submitted webpage snapshot. The live page is never the truth. */

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { toast as copyToast } from "@/lib/toast";
import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@ai-matrx/design-system";
import { toast } from "../../../../host/notify";
import { WebpageSnapshotView } from "../../../../host/ui-slots";
import {
  webpageTitle,
  webpageUrl,
} from "../../../resources/webpage-snapshot";
import type { ContextItemBodyProps } from "../types";
import { Button } from "@ai-matrx/design-system/controls";

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
        Malformed attachment: no webpage URL or saved text
      </div>
    );
  }

  if (typeof webpage === "string") {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-2">
          <p className="text-sm font-medium text-foreground">No saved text for this older attachment</p>
          <p className="text-xs text-muted-foreground">
            Saved before page snapshots; only the link was kept
          </p>
        </div>
      </div>
    );
  }

  return (
    <WebpageSnapshotView
      snapshot={webpage}
      variant={item.origin === "block" ? "submitted" : "draft"}
    />
  );
}

export function WebpageFooter({ item }: ContextItemBodyProps) {
  const { copyText } = useClipboard({
    notify: (message, kind) =>
      kind === "error" ? copyToast.error(message) : copyToast.success(message),
  });
  const webpage = firstWebpage(item);
  const url = webpage ? webpageUrl(webpage) : null;
  const [copied, setCopied] = useState(false);
  if (!url) return null;

  const copy = async () => {
    try {
      await copyText(url);
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
          <Button variant="quiet" icon={copied ? <Check /> : <Copy />} glyphTone={copied ? "success" : undefined} onClick={copy} aria-label="Copy webpage URL" className="ml-auto" />
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
