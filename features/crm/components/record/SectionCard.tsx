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
      className={cn(
        "rounded-md border border-border bg-card",
        className,
      )}
    >
      <header className="flex h-8 items-center gap-1.5 border-b border-border px-2.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
          {title}
        </h3>
        {count !== undefined && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">{action}</div>
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
