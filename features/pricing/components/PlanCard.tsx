"use client";

// features/pricing/components/PlanCard.tsx
//
// One plan from billing.plan_catalog(). Every figure on the card — price,
// annual saving, AI points per window, each limit — is derived from the plan
// row (features/entitlements/catalog/format.ts). The action comes from
// planAction(): sign-up, contact, or the tracked plan-checkout promise.

import type { ReactNode } from "react";
import { Check, Crown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BillingCycle, CatalogPlan } from "@/features/entitlements/catalog/types";
import {
  annualSavingsPercent,
  formatCents,
  formatPoints,
  planFeatureRows,
  planPrice,
  pointsWindows,
  seatNote,
} from "@/features/entitlements/catalog/format";
import { planAction } from "@/features/entitlements/catalog/planAction";

interface PlanCardProps {
  plan: CatalogPlan;
  cycle: BillingCycle;
  signedIn?: boolean;
  /** Is this the most-recommended card in its row (the plan with a badge)? */
  emphasized?: boolean;
  onSelect?: (plan: CatalogPlan, cycle: BillingCycle) => void;
  pending?: boolean;
  variant?: "card" | "compact";
  /** Rendered in place of the plan name — the tier switch of a laddered slot. */
  titleSlot?: ReactNode;
  className?: string;
}

export function PlanCard({
  plan,
  cycle,
  signedIn = false,
  emphasized = !!plan.badge,
  onSelect,
  pending = false,
  variant = "card",
  titleSlot,
  className,
}: PlanCardProps) {
  const price = planPrice(plan, cycle);
  const savings = annualSavingsPercent(plan);
  const showStrike = cycle === "annual" && savings != null && plan.monthlyCents != null;
  const points = pointsWindows(plan);
  const features = planFeatureRows(plan);
  const action = planAction(plan, signedIn);
  const seats = seatNote(plan);

  return (
    <div
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card/95 text-card-foreground transition-all duration-300",
        emphasized
          ? "border-foreground/90 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.18)] dark:shadow-[0_8px_30px_-12px_rgba(255,255,255,0.05)]"
          : "border-border/70 hover:border-foreground/40 hover:shadow-[0_4px_24px_-12px_rgba(0,0,0,0.12)]",
        className,
      )}
    >
      {emphasized && (
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/40 to-transparent" />
      )}

      <div className={cn("flex flex-col gap-1 px-6 pt-6", variant === "compact" && "px-5 pt-5")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {titleSlot ?? <h3 className="text-lg font-semibold tracking-tight">{plan.name}</h3>}
          {plan.badge && (
            <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-background">
              <Crown className="h-3 w-3" strokeWidth={2.5} />
              {plan.badge}
            </span>
          )}
        </div>
        {seats && (
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70">{seats}</span>
        )}
        {plan.tagline && (
          <p className={cn("text-sm text-muted-foreground", variant === "card" && "line-clamp-2 min-h-[2lh]")}>
            {plan.tagline}
          </p>
        )}
      </div>

      <div className={cn("flex items-end gap-2 px-6 pt-5", variant === "compact" && "px-5 pt-4")}>
        <span className="text-4xl font-semibold tracking-tight tabular-nums">
          {price.kind === "custom" ? "Custom" : price.kind === "free" ? "$0" : price.value}
        </span>
        {price.kind === "paid" && (
          <span className="pb-1.5 text-xs leading-tight text-muted-foreground">{price.suffix}</span>
        )}
      </div>

      <div className="min-h-[28px] px-6 pb-1">
        {showStrike && plan.monthlyCents != null ? (
          <span className="text-xs text-muted-foreground">
            <span className="line-through decoration-muted-foreground/60">
              {formatCents(plan.monthlyCents)}
            </span>{" "}
            <span className="font-medium text-emerald-600 dark:text-emerald-400">{savings}% off</span>{" "}
            billed annually
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {price.kind === "free"
              ? "No card needed"
              : price.kind === "custom"
                ? plan.audience === "enterprise"
                  ? "Volume pricing and contracts"
                  : "Custom pricing"
                : "Billed monthly"}
          </span>
        )}
      </div>

      {points.length > 0 && (
        <div className="mx-6 mt-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            AI points{plan.perSeat ? " per seat" : ""}
          </div>
          <dl className="mt-1 flex flex-col gap-0.5">
            {points.map((w) => (
              <div key={w.period} className="flex items-baseline justify-between gap-2">
                <dt className="text-xs text-muted-foreground">{w.label}</dt>
                <dd className="text-sm font-semibold tabular-nums">
                  {w.limit == null ? "Custom" : formatPoints(w.limit)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <ul className="mt-3 flex flex-1 flex-col gap-2.5 px-6 pb-6">
        {features.map((f) => (
          <li
            key={f.capability}
            className={cn("flex items-start gap-2.5 text-sm", !f.included && "text-muted-foreground/70")}
          >
            <span
              className={cn(
                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                f.included ? "bg-foreground/10 text-foreground" : "bg-muted text-muted-foreground/50",
              )}
            >
              {f.included ? (
                <Check className="h-3 w-3" strokeWidth={3} />
              ) : (
                <Minus className="h-3 w-3" strokeWidth={2.5} />
              )}
            </span>
            <span>
              {f.label}
              {f.included && <span className="ml-1 text-xs text-muted-foreground">· {f.value}</span>}
            </span>
          </li>
        ))}
      </ul>

      <div className="border-t border-border/60 p-4">
        <button
          type="button"
          disabled={pending || action.kind === "included"}
          onClick={() => onSelect?.(plan, cycle)}
          className={cn(
            "w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 active:scale-[0.98] disabled:opacity-60",
            emphasized
              ? "bg-foreground text-background hover:bg-foreground/90"
              : "border border-border/80 bg-background hover:border-foreground/40 hover:bg-accent/40",
          )}
        >
          {pending && action.kind === "checkout" ? "Opening checkout…" : action.label}
        </button>
      </div>
    </div>
  );
}
