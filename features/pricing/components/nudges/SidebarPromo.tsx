"use client";

import { useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlanCatalog } from "@/features/entitlements/catalog/usePlanCatalog";
import { defaultPlan } from "@/features/entitlements/catalog/format";

interface SidebarPromoProps {
  /** Optional fraction 0..1 of free quota used. */
  usagePct?: number;
  ctaLabel?: string;
  onCta?: () => void;
  className?: string;
}

export function SidebarPromo({
  usagePct = 0.78,
  ctaLabel = "Upgrade",
  onCta,
  className,
}: SidebarPromoProps) {
  const [dismissed, setDismissed] = useState(false);
  const catalog = usePlanCatalog();
  const freePlanName = (catalog.status === "ready" && defaultPlan(catalog.plans)?.name) || "Current";
  if (dismissed) return null;

  const pct = Math.max(0, Math.min(1, usagePct));
  const pctLabel = Math.round(pct * 100);

  return (
    <div
      className={cn(
        "relative flex flex-col gap-3 overflow-hidden rounded-xl border border-border/70 bg-foreground p-3.5 text-background",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded p-0.5 text-background/60 transition-colors hover:bg-background/10 hover:text-background"
      >
        <X className="h-3 w-3" />
      </button>

      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-background/60">
          {freePlanName} plan
        </span>
        <p className="text-sm font-medium leading-snug tracking-tight">
          You've used {pctLabel}% of this month's messages.
        </p>
      </div>

      <div className="h-1 overflow-hidden rounded-full bg-background/15">
        <div
          className="h-full rounded-full bg-background transition-[width] duration-500"
          style={{ width: `${pctLabel}%` }}
        />
      </div>

      <button
        type="button"
        onClick={onCta}
        className="inline-flex items-center justify-center gap-1.5 rounded-md bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-transform hover:scale-[1.02] active:scale-[0.98]"
      >
        {ctaLabel}
        <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
}
