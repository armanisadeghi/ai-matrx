"use client";

import { Check, Crown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BillingCycle, Plan } from "@/features/pricing/data";
import { ANNUAL_DISCOUNT, formatPrice } from "@/features/pricing/data";

interface PlanCardProps {
  plan: Plan;
  cycle: BillingCycle;
  onSelect?: (plan: Plan) => void;
  variant?: "card" | "compact";
  className?: string;
}

export function PlanCard({
  plan,
  cycle,
  onSelect,
  variant = "card",
  className,
}: PlanCardProps) {
  const { value, suffix } = formatPrice(plan, cycle);
  const monthlyOriginal =
    cycle === "annual" && plan.monthly && plan.annual && plan.annual !== plan.monthly
      ? plan.monthly
      : null;
  const isRecommended = !!plan.recommended;
  const isFree = plan.id === "free";
  const isCustom = plan.priceLabel === "Custom";

  return (
    <div
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card/95 text-card-foreground transition-all duration-300",
        isRecommended
          ? "border-foreground/90 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.18)] dark:shadow-[0_8px_30px_-12px_rgba(255,255,255,0.05)]"
          : "border-border/70 hover:border-foreground/40 hover:shadow-[0_4px_24px_-12px_rgba(0,0,0,0.12)]",
        className,
      )}
    >
      {isRecommended && (
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/40 to-transparent" />
      )}

      {plan.badge && (
        <div className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-foreground px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-background">
          {isRecommended && <Crown className="h-3 w-3" strokeWidth={2.5} />}
          {plan.badge}
        </div>
      )}

      <div
        className={cn(
          "flex flex-col gap-1 px-6 pt-6",
          variant === "compact" && "px-5 pt-5",
        )}
      >
        <div className="flex items-baseline gap-2">
          <h3 className="text-lg font-semibold tracking-tight">{plan.name}</h3>
          {plan.meta && (
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
              {plan.meta}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{plan.tagline}</p>
      </div>

      <div
        className={cn(
          "flex items-end gap-2 px-6 pt-5",
          variant === "compact" && "px-5 pt-4",
        )}
      >
        <span className="text-4xl font-semibold tracking-tight tabular-nums">
          {value}
        </span>
        {suffix && (
          <span className="pb-1.5 text-xs leading-tight text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>

      <div className="px-6 pb-1 min-h-[28px]">
        {monthlyOriginal != null ? (
          <span className="text-xs text-muted-foreground">
            <span className="line-through decoration-muted-foreground/60">
              ${monthlyOriginal}
            </span>{" "}
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
              {Math.round(ANNUAL_DISCOUNT * 100)}% off
            </span>{" "}
            billed annually
          </span>
        ) : isFree ? (
          <span className="text-xs text-muted-foreground">
            Forever free, no card.
          </span>
        ) : isCustom ? (
          <span className="text-xs text-muted-foreground">
            Volume pricing & MSA
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            Billed monthly, cancel anytime
          </span>
        )}
      </div>

      <ul className="mt-3 flex flex-1 flex-col gap-2.5 px-6 pb-6">
        {plan.features.map((f) => (
          <li
            key={f.label}
            className={cn(
              "flex items-start gap-2.5 text-sm",
              !f.included && "text-muted-foreground/70",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                f.included
                  ? f.highlight
                    ? "bg-foreground text-background"
                    : "bg-foreground/10 text-foreground"
                  : "bg-muted text-muted-foreground/50",
              )}
            >
              {f.included ? (
                <Check className="h-3 w-3" strokeWidth={3} />
              ) : (
                <Minus className="h-3 w-3" strokeWidth={2.5} />
              )}
            </span>
            <span className={cn(f.highlight && "font-medium text-foreground")}>
              {f.label}
              {f.detail && (
                <span className="ml-1 text-xs text-muted-foreground">
                  · {f.detail}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="border-t border-border/60 p-4">
        <button
          type="button"
          onClick={() => onSelect?.(plan)}
          className={cn(
            "w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 active:scale-[0.98]",
            isRecommended
              ? "bg-foreground text-background hover:bg-foreground/90"
              : "border border-border/80 bg-background hover:border-foreground/40 hover:bg-accent/40",
          )}
        >
          {plan.cta}
        </button>
      </div>
    </div>
  );
}
