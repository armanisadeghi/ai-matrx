"use client";

import { PanelRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The shared "take it further" action pair for entity tool renderers:
 * **Open in window** + **Open in new tab**. Keeps every entity renderer
 * (document / dataset / workbook / …) consistent with the picklist/task bar.
 *
 * `onOpenWindow` is usually the shell's `onOpenWindowPanel` (opens the tool's
 * overlay component in a draggable window) or a feature-specific window opener.
 */
export function EntityOpenActions({
  onOpenWindow,
  href,
  windowLabel = "Open in window",
  newTabLabel = "New tab",
  className,
}: {
  onOpenWindow?: () => void;
  href?: string;
  windowLabel?: string;
  newTabLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex shrink-0 items-center gap-1.5", className)}>
      {onOpenWindow ? (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={onOpenWindow}
        >
          <PanelRight className="h-3.5 w-3.5" />
          {windowLabel}
        </Button>
      ) : null}
      {href ? (
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <a href={href} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
            {newTabLabel}
          </a>
        </Button>
      ) : null}
    </div>
  );
}
