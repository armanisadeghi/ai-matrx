"use client";

import { cn } from "@/lib/utils";
import type { BillingCycle } from "@/features/entitlements/catalog/types";

interface BillingToggleProps {
  value: BillingCycle;
  onChange: (cycle: BillingCycle) => void;
  /** The largest annual saving the catalog offers (`maxAnnualSavingsPercent`); `null` hides the note. */
  savingsPercent: number | null;
  size?: "sm" | "md";
  className?: string;
}

export function BillingToggle({
  value,
  onChange,
  savingsPercent,
  size = "md",
  className,
}: BillingToggleProps) {
  const isAnnual = value === "annual";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2",
        size === "sm" ? "text-xs" : "text-sm",
        className,
      )}
    >
      <div
        role="tablist"
        aria-label="Billing cycle"
        className={cn(
          "relative inline-flex items-center rounded-full border border-border/80 bg-card/80 p-0.5 shadow-[0_1px_0_0_rgba(0,0,0,0.04)] backdrop-blur-sm",
          size === "sm" ? "h-7" : "h-9",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-0.5 bottom-0.5 rounded-full bg-foreground transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
            isAnnual ? "translate-x-full" : "translate-x-0",
          )}
          style={{ width: "calc(50% - 2px)", left: "2px" }}
        />
        <button
          type="button"
          role="tab"
          aria-selected={!isAnnual}
          onClick={() => onChange("monthly")}
          className={cn(
            "relative z-10 rounded-full font-medium transition-colors",
            size === "sm" ? "px-3" : "px-4",
            !isAnnual
              ? "text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Monthly
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isAnnual}
          onClick={() => onChange("annual")}
          className={cn(
            "relative z-10 rounded-full font-medium transition-colors",
            size === "sm" ? "px-3" : "px-4",
            isAnnual
              ? "text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Annual
        </button>
      </div>
      {savingsPercent != null && (
        <span
          className={cn(
            "font-medium tracking-tight transition-opacity",
            isAnnual ? "text-emerald-600 dark:text-emerald-400 opacity-100" : "text-muted-foreground opacity-70",
          )}
        >
          Save up to {savingsPercent}%
        </span>
      )}
    </div>
  );
}
