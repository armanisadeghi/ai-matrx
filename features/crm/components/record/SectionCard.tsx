"use client";

// features/crm/components/record/SectionCard.tsx
//
// The record page's dense section shell: one thin-bordered card, a compact
// uppercase header row with a count and an optional action, tight content.
// Hierarchy via type scale + tokens — never boxes-in-boxes.

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  Icon: LucideIcon;
  count?: number;
  /** Right-aligned header action (an "Add" toggle, usually). */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SectionCard({
  title,
  Icon,
  count,
  action,
  children,
  className,
}: Props) {
  return (
    <section
      className={cn("rounded-md border border-border bg-card", className)}
    >
      <header className="flex min-h-8 flex-wrap items-center gap-x-1.5 border-b border-border px-2.5 py-1 sm:flex-nowrap sm:py-0">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <h3 className="min-w-0 text-xs font-semibold uppercase tracking-wider text-foreground">
          {title}
        </h3>
        {count !== undefined && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
        {action ? (
          <div className="mt-1 flex basis-full items-center gap-1 border-t border-border/60 pt-1 sm:ml-auto sm:mt-0 sm:basis-auto sm:border-0 sm:pt-0 max-sm:[&>div]:w-full max-sm:[&_button]:min-h-11">
            {action}
          </div>
        ) : null}
      </header>
      <div className="p-2">{children}</div>
    </section>
  );
}

/** Compact centered empty state for a section with no rows yet. */
export function SectionEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
      {children}
    </div>
  );
}
