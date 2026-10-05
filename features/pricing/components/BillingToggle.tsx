"use client";

import { cn } from "@/lib/utils";
import type { BillingCycle } from "@/features/entitlements/catalog/types";

interface PillSwitchOption<T extends string> {
  value: T;
  label: string;
}

interface PillSwitchProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly PillSwitchOption<T>[];
  "aria-label": string;
  size?: "sm" | "md";
  /** Equal-width segments with a sliding thumb (default); `false` sizes each segment to its label. */
  equal?: boolean;
  className?: string;
}

/** The pricing capsule switch. */
export function PillSwitch<T extends string>({
  value,
  onChange,
  options,
  "aria-label": ariaLabel,
  size = "md",
  equal = true,
  className,
}: PillSwitchProps<T>) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "relative items-center rounded-full border border-border/80 bg-card/80 p-0.5 shadow-[0_1px_0_0_rgba(0,0,0,0.04)] backdrop-blur-sm",
        size === "sm" ? "h-7 type-secondary" : "h-9 type-body",
        equal ? "inline-grid" : "inline-flex",
        className,
      )}
      style={equal ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}
    >
      {equal && (
        <span
          aria-hidden
          className="absolute top-0.5 bottom-0.5 left-0.5 rounded-full bg-foreground transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{
            width: `calc((100% - 4px) / ${options.length})`,
            transform: `translateX(${index * 100}%)`,
          }}
        />
      )}
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative z-10 h-full whitespace-nowrap rounded-full font-medium transition-colors",
              size === "sm" ? "px-2.5" : "px-4",
              !equal && "flex-1",
              active ? "text-background" : "text-muted-foreground hover:text-foreground",
              active && !equal && "bg-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const CYCLES = [
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Annual" },
] as const satisfies readonly PillSwitchOption<BillingCycle>[];

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
        size === "sm" ? "type-secondary" : "type-body",
        className,
      )}
    >
      <PillSwitch value={value} onChange={onChange} options={CYCLES} aria-label="Billing cycle" size={size} />
      {savingsPercent != null && (
        <span
          className={cn(
            "whitespace-nowrap font-medium tracking-tight transition-opacity",
            isAnnual ? "text-emerald-600 dark:text-emerald-400 opacity-100" : "text-muted-foreground opacity-70",
          )}
        >
          Save up to {savingsPercent}%
        </span>
      )}
    </div>
  );
}
