"use client";

import { cn } from "@/lib/utils";

interface Props {
  title?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

/**
 * Standard container for live-pipeline sections.
 * Matches the matrx-shell-glass aesthetic used throughout ResearchOverview.
 */
export function SectionCard({
  title,
  trailing,
  className,
  bodyClassName,
  children,
}: Props) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm overflow-hidden",
        className,
      )}
    >
      {(title || trailing) && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/40 bg-muted/20">
          {title && (
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground/80">
              {title}
            </div>
          )}
          {trailing && <div className="flex items-center gap-2">{trailing}</div>}
        </div>
      )}
      <div className={cn("p-3", bodyClassName)}>{children}</div>
    </div>
  );
}
