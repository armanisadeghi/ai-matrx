// features/entitlements/components/PlanUsagePanel.tsx
//
// "WHERE AM I AT?" — the one screen that answers it.
//
// Arman's requirement, 2026-08-14: *"What does it do when you run out? Where
// does it show you what you're at right now?"* This is the second half. Every
// dimension of the plan, what's used, what's left, when it resets, and — on the
// same row — what the next plan up would give. A limit and its fix are never on
// two different screens.
//
// Rules this screen keeps:
//   * NEVER show a number we don't have. A dimension billing doesn't measure
//     (storage, agent count) says "not counted here" — a confident 0 on a usage
//     screen is a lie, and a user who trusts it gets a nasty surprise later.
//   * Say plainly which limits actually STOP you and which are only shown. A
//     meter that looks enforced but isn't trains people to ignore all of them.
//   * Every number comes from the database. No plan detail is hardcoded.

"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Infinity as InfinityIcon, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchPlanStatus, type PlanDimension, type PlanStatus } from "../plan-service";
import { CAPABILITY_REGISTRY, isCapability } from "../registry";

/** Bytes get human units; everything else is a plain count. */
function formatValue(capability: string, value: number): string {
  if (capability.endsWith("_bytes")) {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let v = value;
    let u = 0;
    while (v >= 1024 && u < units.length - 1) {
      v /= 1024;
      u += 1;
    }
    return `${v % 1 === 0 ? v : v.toFixed(1)} ${units[u]}`;
  }
  return value.toLocaleString();
}

function label(capability: string): string {
  return isCapability(capability)
    ? CAPABILITY_REGISTRY[capability].label
    : capability;
}

function periodLabel(period: string | null): string {
  switch (period) {
    case "month":
      return "this month";
    case "day":
      return "today";
    case "week":
      return "this week";
    case "rolling_1h":
      return "in the last hour";
    case "rolling_5h":
      return "in the last 5 hours";
    default:
      return "";
  }
}

function DimensionRow({ d }: { d: PlanDimension }) {
  const unlimited = d.unlimited || d.limit === null;
  const measured = d.used !== null;
  const pct =
    !unlimited && measured && d.limit
      ? Math.min(100, Math.round((d.used! / d.limit) * 100))
      : 0;
  // Colour only earns attention near the top of the range; a bar that is red at
  // 40% teaches people to ignore it.
  const tone =
    pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-primary";

  return (
    <div className="border-b border-border py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-foreground">
          {label(d.capability)}
          {d.fromAddon ? (
            <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              <Plus className="h-2.5 w-2.5" aria-hidden />
              add-on
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {unlimited ? (
            <span className="inline-flex items-center gap-1">
              <InfinityIcon className="h-3.5 w-3.5" aria-hidden />
              Unlimited
            </span>
          ) : measured ? (
            <>
              <span className="text-foreground">
                {formatValue(d.capability, d.used!)}
              </span>
              {" of "}
              {formatValue(d.capability, d.limit!)}
            </>
          ) : (
            // We know the ceiling but billing does not count the usage. Say so.
            <>{formatValue(d.capability, d.limit!)} included</>
          )}
        </span>
      </div>

      {!unlimited && measured ? (
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", tone)}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {!unlimited && measured && d.resetsAt ? (
          <span>
            Resets {new Date(d.resetsAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
        ) : null}
        {!measured && !unlimited ? (
          <span>Usage is tracked where the files live, not here</span>
        ) : null}
        {/* The honest disclosure: is this limit real today, or just visible? */}
        {!d.enforced && !unlimited ? (
          <span>Shown for planning — not enforced yet</span>
        ) : null}
        {d.nextPlanLimit != null && !unlimited && d.limit != null &&
        d.nextPlanLimit > d.limit ? (
          <span>
            Next plan: {formatValue(d.capability, d.nextPlanLimit)}
            {periodLabel(d.period) ? ` ${periodLabel(d.period)}` : ""}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function PlanUsagePanel({
  organizationId,
  className,
}: {
  organizationId: string | null | undefined;
  className?: string;
}) {
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setStatus(await fetchPlanStatus(organizationId));
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  // NO ORG is not the same as LOADING. Collapsing them spins forever on a
  // session whose org hasn't resolved — a spinner with no end is the dead end
  // this doctrine exists to kill. Say what's missing and how to fix it.
  if (!organizationId) {
    return (
      <div className={cn("rounded-lg border border-border bg-card p-4", className)}>
        <p className="text-sm text-foreground">
          Pick an organization to see its plan.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          A plan belongs to an account, so we need to know which one you&apos;re
          looking at.
        </p>
        <Button size="sm" variant="outline" className="mt-2" asChild>
          <a href="/settings/organizations">Choose an organization</a>
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 p-4 text-sm text-muted-foreground",
          className,
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading your plan…
      </div>
    );
  }

  if (!status?.plan) {
    // Never a dead end: say what happened and give a way on.
    return (
      <div className={cn("rounded-lg border border-border bg-card p-4", className)}>
        <p className="text-sm text-foreground">
          We couldn&apos;t load your plan just now.
        </p>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  const { plan, nextPlan, dimensions } = status;
  const price =
    plan.monthlyCents == null
      ? "Custom"
      : plan.monthlyCents === 0
        ? "Free"
        : `$${(plan.monthlyCents / 100).toFixed(0)}${plan.perSeat ? " per seat" : ""} / month`;

  return (
    <div className={cn("rounded-lg border border-border bg-card", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              {plan.name} plan
            </h3>
            {plan.badge ? (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {plan.badge}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {price}
            {plan.tagline ? ` · ${plan.tagline}` : ""}
          </p>
        </div>
        {nextPlan ? (
          <Button size="sm" asChild>
            <a href="/pricing">
              Upgrade to {nextPlan.name}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </a>
          </Button>
        ) : (
          // Top of the ladder is a real answer — don't invent an upsell.
          <span className="text-xs text-muted-foreground">
            You&apos;re on our top plan
          </span>
        )}
      </div>

      <div className="px-4">
        {dimensions.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            This plan has no limits configured.
          </p>
        ) : (
          dimensions.map((d) => <DimensionRow key={d.capability} d={d} />)
        )}
      </div>
    </div>
  );
}
