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
import {
  PLANS,
  formatPrice,
  type BillingCycle,
  type Plan,
} from "@/features/pricing/data";

interface UsageLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What was hit (e.g. "Messages", "Tool calls", "Active agents"). */
  meter?: string;
  used?: number;
  limit?: number;
  /** When the meter resets — ISO string or Date. */
  resetsAt?: string | Date;
  currentPlan?: string;
  recommendedPlanIds?: string[];
  cycle?: BillingCycle;
  onSelect?: (plan: Plan) => void;
}

function formatCountdown(diffMs: number) {
  if (diffMs <= 0) return "Now";
  const totalSec = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (days >= 2) return `${days} days`;
  if (days === 1) return `1 day, ${hours}h`;
  if (hours >= 1) return `${hours}h ${mins}m`;
  if (mins >= 1) return `${mins}m`;
  return "<1m";
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
  meter = "Messages",
  used = 100,
  limit = 100,
  resetsAt,
  currentPlan = "Free",
  recommendedPlanIds = ["entry", "pro", "plus"],
  cycle = "annual",
  onSelect,
}: UsageLimitDialogProps) {
  const reset =
    resetsAt instanceof Date
      ? resetsAt
      : resetsAt
        ? new Date(resetsAt)
        : new Date(Date.now() + 6 * 86400 * 1000 + 4 * 3600 * 1000);

  const [countdown, setCountdown] = useState(() =>
    formatCountdown(reset.getTime() - Date.now()),
  );

  useEffect(() => {
    if (!open) return undefined;
    const tick = () =>
      setCountdown(formatCountdown(reset.getTime() - Date.now()));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [open, reset]);

  const recommended = recommendedPlanIds
    .map((id) => PLANS.find((p) => p.id === id))
    .filter((p): p is Plan => !!p);

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
                You're on the {currentPlan} plan. Either wait for the reset or
                step up — both work. No data is lost either way.
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
                  width: `${Math.min(100, (used / limit) * 100)}%`,
                }}
              />
            </div>
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
          </div>

          {/* Plan options */}
          <div className="px-7 pb-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Crown className="h-3 w-3" />
                Or skip the wait
              </span>
              <span className="text-xs text-muted-foreground">
                14-day trial · cancel anytime
              </span>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-3">
              {recommended.map((plan) => {
                const { value, suffix } = formatPrice(plan, cycle);
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => onSelect?.(plan)}
                    className={cn(
                      "group flex flex-col gap-2 rounded-xl border p-4 text-left transition-all",
                      plan.recommended
                        ? "border-foreground bg-foreground/[0.03]"
                        : "border-border/70 hover:border-foreground/40 hover:bg-accent/30",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{plan.name}</span>
                      {plan.recommended && (
                        <span className="rounded-full bg-foreground px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-background">
                          Pick
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-semibold tabular-nums">
                        {value}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {suffix}
                      </span>
                    </div>
                    <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                      {plan.features
                        .filter((f) => f.included)
                        .slice(0, 2)
                        .map((f) => (
                          <li
                            key={f.label}
                            className="flex items-start gap-1.5"
                          >
                            <Check
                              className="mt-0.5 h-3 w-3 shrink-0 text-foreground"
                              strokeWidth={3}
                            />
                            <span className="line-clamp-1">{f.label}</span>
                          </li>
                        ))}
                    </ul>
                    <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium">
                      Upgrade to {plan.name}
                      <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-muted/20 px-7 py-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              I'll wait for the reset
            </button>
            <a
              href="#"
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
