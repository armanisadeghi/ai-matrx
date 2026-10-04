"use client";

/**
 * Layout and sample data of the settled-system page. Every control on the page
 * is THE control from `@ai-matrx/design-system/controls` (28px, its own 3px
 * half-gap; containers add no gap); this file holds only the page's section
 * frame and its rows.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { BadgeTone } from "@ai-matrx/design-system/controls";

/** A page section: hairline above, title, groups spaced apart, no box. */
export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 border-b border-border py-6">
      <h2 id={`${id}-title`} className="mb-4 text-[0.8125rem] font-semibold text-foreground">
        {title}
      </h2>
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  );
}

/** A group inside a section: an 11px label, then its content. */
export function Group({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="text-[0.6875rem] font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

export const ROWS = [
  { id: "r1", name: "Quarterly client report", owner: "Ana Ruiz", updated: "2h ago", runs: 128, status: "draft" },
  { id: "r2", name: "Intake form — dental", owner: "Ben Ortiz", updated: "Yesterday", runs: 2140, status: "live" },
  { id: "r3", name: "Weekly check-in agenda", owner: "Ana Ruiz", updated: "3d ago", runs: 46, status: "review" },
  { id: "r4", name: "Old onboarding checklist", owner: "Dana Reyes", updated: "1w ago", runs: 9, status: "failed" },
  { id: "r5", name: "Referral letter template", owner: "Chris Lee", updated: "2w ago", runs: 311, status: "live" },
] as const;

export type Row = (typeof ROWS)[number];

export const STATUS: Record<Row["status"], { tone: BadgeTone; label: string }> = {
  draft: { tone: "neutral", label: "Draft" },
  live: { tone: "success", label: "Live" },
  review: { tone: "warning", label: "In review" },
  failed: { tone: "destructive", label: "Failed" },
};
