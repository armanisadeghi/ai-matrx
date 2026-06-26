"use client";

// Shared layout primitives for the task editor — a section header and a
// label/value property row. Used by TaskEditorBody (the content) AND the task
// window chrome (so window-only fields like Status / Parent match the body's
// property rows exactly). Pure presentation, no state.

import type { ComponentType, ReactNode } from "react";
import { cn } from "@/utils/cn";

export function SectionHeader({
  icon: Icon,
  label,
  count,
  className,
}: {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-2 flex items-center gap-1.5 pl-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
        className,
      )}
    >
      {Icon && <Icon className="w-3 h-3" />}
      <span>{label}</span>
      {typeof count === "number" && (
        <span className="text-muted-foreground/60 tabular-nums">({count})</span>
      )}
    </div>
  );
}

export function PropertyRow({
  icon: Icon,
  label,
  children,
  first,
  last,
  compact,
}: {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  children: ReactNode;
  first?: boolean;
  last?: boolean;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex h-7 items-center gap-1.5 pl-1.5 pr-1">
        {Icon ? (
          <Icon className="size-3 shrink-0 text-muted-foreground" />
        ) : null}
        <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
          {label}
        </span>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2.5",
        !first && "border-t border-border/40",
      )}
    >
      <div className="flex w-20 shrink-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {Icon && <Icon className="w-3 h-3" />}
        <span>{label}</span>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
