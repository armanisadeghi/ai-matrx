"use client";

/**
 * OverriddenCountBadge — the canonical "N of M overridden" pill for any
 * surface that lists agent slots (or slot-backed roles). Primary-toned when
 * at least one override is live, muted otherwise. Consumed by /agents/slots
 * and research's per-topic agents page.
 */

import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function OverriddenCountBadge({
  overridden,
  total,
  className,
}: {
  overridden: number;
  total: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium ring-1 ring-inset",
        overridden > 0
          ? "bg-primary/8 text-primary ring-primary/15"
          : "bg-muted/50 text-muted-foreground ring-border/60",
        className,
      )}
    >
      <ShieldCheck className="h-3 w-3" />
      <span className="tabular-nums">
        {overridden} of {total}
      </span>{" "}
      overridden
    </span>
  );
}
