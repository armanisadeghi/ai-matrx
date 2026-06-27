"use client";

import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

/**
 * A delicate hover "peek" for an individual listed part inside an entity card —
 * a thin muted header + a glimpse of that part's detail. The placeholder for a
 * future registry of "known internal parts" (picklist item, dataset field,
 * search keyword → top sites, search source → AI review, …).
 *
 * Wrap any list-row trigger; supply a `header` (the part's name) and `body`
 * (the peek content).
 */
export function PartPeekPopover({
  children,
  header,
  body,
  side = "top",
  align = "start",
  className,
  headerClassName,
}: {
  children: React.ReactNode;
  header?: React.ReactNode;
  body: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  className?: string;
  /** Tint the header strip (e.g. a per-kind accent wash). Replaces the default
   * muted background when set — keep it light/dark safe. */
  headerClassName?: string;
}) {
  return (
    <HoverCard openDelay={140} closeDelay={80}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side={side}
        align={align}
        className={cn("w-72 overflow-hidden p-0", className)}
      >
        {header ? (
          <div
            className={cn(
              "border-b border-border px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground",
              headerClassName ?? "bg-muted/40",
            )}
          >
            {header}
          </div>
        ) : null}
        <div className="px-3 py-2.5 text-xs leading-relaxed text-foreground">
          {body}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
