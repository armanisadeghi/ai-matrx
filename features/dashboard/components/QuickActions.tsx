"use client";

import Link from "next/link";
import ShellIcon from "@/features/shell/components/ShellIcon";
import { iconColorMap } from "@/features/shell/constants/nav-data";
import { cn } from "@/lib/utils";
import { QUICK_ACTIONS } from "../dashboard.config";

export function QuickActions({
  openInNewTab = false,
  layout = "rail",
}: {
  openInNewTab?: boolean;
  layout?: "rail" | "grid";
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Start something
      </h2>
      <div
        className={cn(
          layout === "grid"
            ? "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
            : "-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none",
        )}
      >
        {QUICK_ACTIONS.map((a) => (
          <Link
            key={a.id}
            href={a.href}
            target={openInNewTab ? "_blank" : undefined}
            rel={openInNewTab ? "noopener noreferrer" : undefined}
            prefetch={openInNewTab ? false : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-foreground/20 hover:bg-accent/50",
              layout === "grid" && "min-w-0 px-2.5",
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-lg",
                iconColorMap[a.color] ?? iconColorMap.slate,
              )}
            >
              <ShellIcon name={a.iconName} size={14} strokeWidth={2} />
            </span>
            <span className="min-w-0 truncate">{a.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
