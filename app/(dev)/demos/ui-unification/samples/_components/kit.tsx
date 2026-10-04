"use client";

/**
 * Sample-page kit. Every control, tab, badge, row group, empty state and
 * skeleton on the samples is THE control from `@ai-matrx/design-system/controls`
 * — this file holds only what is particular to a sample page: its header title.
 *
 * Read-only by construction: nothing in this kit writes anywhere.
 */

import type { LucideIcon } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Header title for the shell's glass header (text only — no controls)  */
/* ------------------------------------------------------------------ */

export function SampleTitle({ icon: Icon, title, meta }: { icon: LucideIcon; title: string; meta?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate text-[0.8125rem] font-semibold">{title}</span>
      {meta ? <span className="shrink-0 text-[0.6875rem] text-muted-foreground">{meta}</span> : null}
    </div>
  );
}
