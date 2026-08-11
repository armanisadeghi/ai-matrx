"use client";

import Link from "next/link";
import { ArrowRight, Route } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AuthorityRouterDoor({
  sitePath,
  compact = false,
  className,
}: {
  sitePath: string;
  compact?: boolean;
  className?: string;
}) {
  if (compact) {
    return (
      <Button
        asChild
        size="sm"
        variant="outline"
        className={cn("gap-1.5", className)}
      >
        <Link href={`${sitePath}/authority`}>
          <Route className="h-3.5 w-3.5" />
          Route authority
        </Link>
      </Button>
    );
  }

  return (
    <Link
      href={`${sitePath}/authority`}
      className={cn(
        "group flex items-center justify-between gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 transition-colors hover:bg-emerald-500/10",
        className,
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="rounded-md bg-emerald-500/10 p-1.5 text-emerald-700 dark:text-emerald-400">
          <Route className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-semibold">
            Route this authority
          </span>
          <span className="block text-[11px] leading-relaxed text-muted-foreground">
            Turn backlink and crawl evidence into exact internal-link actions.
          </span>
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
