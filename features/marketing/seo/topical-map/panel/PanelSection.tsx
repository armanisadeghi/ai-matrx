"use client";

/**
 * One section of the topic panel — the shell every section below the identity
 * block wears, so the panel reads as ONE document (Linear's issue panel: a
 * quiet uppercase heading, a count when there is one, an action at the right,
 * the rows underneath).
 *
 * A count is only printed when the caller HAS it. Absent is not zero.
 */

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface PanelSectionProps {
  title: string;
  /** Printed beside the title. Omit when the number is not loaded. */
  count?: number;
  /** Right-aligned control (an add button, a door). Absent in read-only hosts. */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function PanelSection({ title, count, action, className, children }: PanelSectionProps) {
  return (
    <section
      aria-label={title}
      className={cn("border-t border-border pt-3", className)}
      data-panel-section={title}
    >
      <header className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
          {count !== undefined ? (
            <span className="ml-1.5 font-normal tabular-nums normal-case tracking-normal">
              {count}
            </span>
          ) : null}
        </h3>
        {action ? <div className="flex shrink-0 items-center gap-1">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** A one-line, honest empty state for a section — never a blank gap. */
export function PanelEmptyLine({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}
