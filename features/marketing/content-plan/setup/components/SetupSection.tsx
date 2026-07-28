"use client";

/**
 * The Setup view borrows the workspace's ONE panel-section grammar (the same
 * header classes `NodePanel` / `AttributesEditor` / `NodeAssociations` use), so
 * a fifth view does not introduce a fifth visual language.
 */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function SetupSection({
  title,
  action,
  className,
  children,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("space-y-2.5", className)}>
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
          {title}
        </h4>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A labelled number, used for the work-order totals. Fixed footprint. */
export function Stat({
  value,
  label,
  tone = "default",
}: {
  value: number | string;
  label: string;
  tone?: "default" | "primary" | "muted";
}) {
  return (
    <div className="min-w-16 rounded-md border border-border bg-background px-2.5 py-1.5">
      <div
        className={cn(
          "text-base font-semibold tabular-nums leading-none",
          tone === "primary" && "text-primary",
          tone === "muted" && "text-muted-foreground",
          tone === "default" && "text-foreground",
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-[11px] leading-none text-muted-foreground">{label}</div>
    </div>
  );
}
