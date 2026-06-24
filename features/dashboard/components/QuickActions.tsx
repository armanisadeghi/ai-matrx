"use client";

import Link from "next/link";
import ShellIcon from "@/features/shell/components/ShellIcon";
import { iconColorMap } from "@/features/shell/constants/nav-data";
import { cn } from "@/lib/utils";
import { QUICK_ACTIONS } from "../constants/metricCards";

export function QuickActions() {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Start something
      </h2>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
        {QUICK_ACTIONS.map((a) => (
          <Link
            key={a.id}
            href={a.href}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-foreground/20 hover:bg-accent/50"
          >
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-lg",
                iconColorMap[a.color] ?? iconColorMap.slate,
              )}
            >
              <ShellIcon name={a.iconName} size={14} strokeWidth={2} />
            </span>
            {a.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
