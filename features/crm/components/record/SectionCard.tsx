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
  /** Keep a compact icon action on the title row at mobile widths. */
  compactAction?: boolean;
  /**
   * EMPTY IS COMPACT: the section has nothing to show, so it is ONE line —
   * its heading, its 0 and its create action — never a full card announcing
   * the absence.
   */
  empty?: boolean;
  children: ReactNode;
  className?: string;
}

export function SectionCard({
  title,
  Icon,
  count,
  action,
  compactAction = false,
  empty = false,
  children,
  className,
}: Props) {
  return (
    <section
      className={cn(
        // Dense on a desktop mouse: header TapButtons shrink to 28px (the
        // package's own size variable), so a one-row card is one short band.
        // Touch and narrow screens keep the 44px target.
        "group/section rounded-md border border-border bg-card lg:pointer-fine:[--matrx-tap-target-size:1.75rem]",
        className,
      )}
    >
      <header
        className={cn(
          "flex min-h-8 flex-wrap items-center gap-x-1.5 px-2.5 py-1 sm:flex-nowrap sm:py-0",
          !empty && "border-b border-border",
        )}
      >
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
          <div
            className={cn(
              "flex items-center gap-1 max-sm:[&_button]:min-h-11",
              compactAction || empty
                ? "ml-auto shrink-0"
                : "mt-1 basis-full border-t border-border/60 pt-1 sm:ml-auto sm:mt-0 sm:basis-auto sm:border-0 sm:pt-0 max-sm:[&>div]:w-full",
            )}
          >
            {action}
          </div>
        ) : null}
      </header>
      {/* Empty still MOUNTS its children (hidden), so a dialog or portal the
          section owns — a "New deal" dialog opened from the header — works. */}
      <div className={empty ? "hidden" : "p-2"}>{children}</div>
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
