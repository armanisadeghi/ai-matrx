"use client";

import { useEffect, useState } from "react";
import {
  AlertOctagon,
  ArrowRight,
  Check,
  Clock,
  Crown,
  X
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatDurationMs } from "@ai-matrx/kit/format";
import { usePlanCatalog } from "@/features/entitlements/catalog/usePlanCatalog";
import {
  formatPoints,
  planPrice,
  pointsWindows,
  upgradePlans,
} from "@/features/entitlements/catalog/format";
import type { BillingCycle, CatalogPlan } from "@/features/entitlements/catalog/types";
import { useChoosePlan } from "./useChoosePlan";

/** How many paid plans the dialog offers side by side. */
const OFFERED_PLAN_COUNT = 3;

interface UsageLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What was hit (e.g. "Messages", "AI points") — the capability label. */
  meter: string;
  used: number;
  limit: number;
  /** When the meter resets — ISO string or Date. Absent = no countdown shown. */
  resetsAt?: string | Date;
  /** The person's plan name, when known. */
  currentPlan?: string;
  /** Plan keys to offer; defaults to the first paid personal plans in the catalog. */
  recommendedPlanKeys?: string[];
  cycle?: BillingCycle;
  /** Override what choosing a plan does (demos). Defaults to useChoosePlan. */
  onSelect?: (plan: CatalogPlan) => void;
}

/**
 * THE prose voice: @ai-matrx/kit/format's `long` ("2 days", "5 hours",
 * "20 minutes"), which lands inside the reset sentence this dialog shows.
 * It floors, so the reset never reads sooner than it is.
 */
function formatCountdown(diffMs: number) {
  if (diffMs <= 0) return "Now";
  return formatDurationMs(diffMs, { style: "long" });
}

function formatResetDate(date: Date) {
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function UsageLimitDialog({
  open,
  onOpenChange,
  meter,
  used,
  limit,
  resetsAt,
  currentPlan,
  recommendedPlanKeys,
  cycle = "annual",
  onSelect,
}: UsageLimitDialogProps) {
  const reset =
    resetsAt instanceof Date ? resetsAt : resetsAt ? new Date(resetsAt) : null;
  const resetMs = reset?.getTime() ?? null;

  const [countdown, setCountdown] = useState(() =>
    resetMs == null ? null : formatCountdown(resetMs - Date.now()),
  );

  useEffect(() => {
    if (!open || resetMs == null) return undefined;
    const tick = () => setCountdown(formatCountdown(resetMs - Date.now()));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [open, resetMs]);

  const catalog = usePlanCatalog();
  const { choose } = useChoosePlan();
  const handleSelect = onSelect ?? choose;
  const plans = catalog.status === "ready" ? catalog.plans : [];
  const recommended = recommendedPlanKeys
    ? recommendedPlanKeys
        .map((key) => plans.find((p) => p.planKey === key))
        .filter((p): p is CatalogPlan => !!p)
    : upgradePlans(plans, "personal").slice(0, OFFERED_PLAN_COUNT);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="overflow-hidden border-border/70 p-0 sm:max-w-2xl [&>button.absolute]:hidden"
      >
        <div className="relative">
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/30 to-transparent"
          />
          <div className="flex items-start gap-4 px-7 pb-2 pt-7">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.06] ring-1 ring-foreground/10">
              <AlertOctagon
                className="h-5 w-5 text-foreground"
                strokeWidth={1.75}
              />
            </span>
            <div className="flex flex-1 flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold tracking-tight">
                  You've reached your {meter.toLowerCase()} limit
                </h2>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-sm text-muted-foreground">
                {currentPlan ? `You're on the ${currentPlan} plan. ` : ""}
                Wait for the reset, or pick a bigger plan.
              </p>
            </div>
          </div>

          {/* Usage strip */}
          <div className="mx-7 my-5 flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/30 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {meter}
              </span>
              <span className="font-mono text-sm tabular-nums">
                <span className="font-semibold">{used.toLocaleString()}</span>
                <span className="text-muted-foreground">
                  {" / "}
                  {limit.toLocaleString()}
                </span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-background ring-1 ring-border">
              <div
                className="h-full rounded-full bg-foreground"
                style={{
                  width: `${limit > 0 ? Math.min(100, (used / limit) * 100) : 100}%`,
                }}
              />
            </div>
            {reset && countdown && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Resets in{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {countdown}
                  </span>
                </span>
                <span className="hidden sm:inline">
                  {formatResetDate(reset)}
                </span>
              </div>
            )}
          </div>

          {/* Plan options — from billing.plan_catalog(); hidden until it answers. */}
          {recommended.length > 0 && (
          <div className="px-7 pb-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Crown className="h-3 w-3" />
                Or skip the wait
              </span>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-3">
              {recommended.map((plan) => {
                const price = planPrice(plan, cycle);
                const monthPoints = pointsWindows(plan).find((w) => w.period === "month");
                return (
                  <button
                    key={plan.planKey}
                    type="button"
                    onClick={() => handleSelect(plan)}
                    className={cn(
                      "group flex flex-col gap-2 rounded-xl border p-4 text-left transition-all",
                      plan.badge
                        ? "border-foreground bg-foreground/[0.03]"
                        : "border-border/70 hover:border-foreground/40 hover:bg-accent/30",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{plan.name}</span>
                      {plan.badge && (
                        <span className="rounded-full bg-foreground px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-background">
                          {plan.badge}
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-semibold tabular-nums">
                        {price.kind === "paid" ? price.value : price.kind === "free" ? "$0" : "Custom"}
                      </span>
                      {price.kind === "paid" && (
                        <span className="text-[10px] text-muted-foreground">
                          {price.suffix}
                        </span>
                      )}
                    </div>
                    {monthPoints && (
                      <span className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-foreground" strokeWidth={3} />
                        {monthPoints.limit == null
                          ? "Custom AI points"
                          : `${formatPoints(monthPoints.limit)} AI points / month`}
                      </span>
                    )}
                    <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium">
                      Upgrade to {plan.name}
                      <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-muted/20 px-7 py-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              I'll wait for the reset
            </button>
            <a
              href="/pricing"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              See full pricing
              <ArrowRight className="h-3 w-3" />
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
