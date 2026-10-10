"use client";

// features/entitlements/usage-gate/MyUsageCard.tsx
//
// Settings → Plan & usage, primary card: the PERSON's own AI-points state.
// AI points are per user first (USAGE-GATE.md "The one answer"), so this reads
// the usage gate's Redux answer — `billing.user_usage_state`, verbatim — and
// never an organization's numbers. Opening the tab refreshes it once in the
// background (a page read, never on an AI request's path).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSurfaceScopeContribution } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { ArrowUpRight, Infinity as InfinityIcon, RotateCw } from "lucide-react";
import { formatCost, pointsToUsd } from "@ai-matrx/kit/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  selectUsageGateFetchedAt,
  selectUsageGateLevel,
  selectUsageGatePlanName,
  selectUsageGateFreePeriod,
  selectUsageGateWindows,
} from "../state/selectors";
import { refreshUsageInBackground } from "./usageGate";
import type { UsageGateLevel, UsageWindow } from "./usageState";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
function windowLabel(period: string): string {
  switch (period) {
    case "day":
      return "Today";
    case "week":
      return "This week";
    case "month":
      return "This month";
    case "rolling_1h":
      return "Last hour";
    case "rolling_5h":
      return "Last 5 hours";
    case "lifetime":
      return "All time";
    default:
      return period;
  }
}

function formatReset(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const LEVEL_CHIP: Record<UsageGateLevel, { text: string; tone: string }> = {
  ok: { text: "On track", tone: "bg-muted text-muted-foreground" },
  near: {
    text: "Near limit",
    tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  over: { text: "Limit reached", tone: "bg-destructive/10 text-destructive-ink" },
};

function WindowRow({ w }: { w: UsageWindow }) {
  // This is render-time formatting. `useCostDisplay` subscribes to the knob
  // snapshot, so values re-render when the points rate answers after usage.
  const { unit, rate } = useCostDisplay();
  const points = (v: number) =>
    formatCost(pointsToUsd(v, { rate }), { rate, unit });
  const pct =
    w.used !== null && w.limit !== null && w.limit > 0
      ? Math.min(100, Math.round((w.used / w.limit) * 100))
      : 0;
  const hasMeasuredProgress =
    w.used !== null && w.limit !== null && w.limit > 0;
  const bar =
    w.state === "over"
      ? "bg-destructive"
      : w.state === "near"
        ? "bg-amber-500"
        : "bg-primary";
  const reset = formatReset(w.resetsAt);

  return (
    <div className="border-b border-border py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="type-title text-foreground">
          {windowLabel(w.period)}
        </span>
        <span className="shrink-0 type-body tabular-nums text-muted-foreground">
          {w.limit === null ? (
            <span className="inline-flex items-center gap-1">
              <InfinityIcon className="h-3.5 w-3.5" aria-hidden />
              Unlimited
            </span>
          ) : w.limit === 0 ? (
            "Not included"
          ) : (
            <>
              <span className="text-foreground">
                {w.used === null ? "—" : points(w.used)}
              </span>
              {" of "}
              {points(w.limit)}
            </>
          )}
        </span>
      </div>
      {hasMeasuredProgress ? (
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", bar)}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
      {reset && w.limit !== null ? (
        <p className="mt-1 type-secondary text-muted-foreground">Resets {reset}</p>
      ) : null}
    </div>
  );
}

export function MyUsageCard({ className }: { className?: string }) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const userId = useAppSelector(selectUserId);
  const level = useAppSelector(selectUsageGateLevel);
  const planName = useAppSelector(selectUsageGatePlanName);
  // The effective plan can be a FREE grant above what the person buys (the
  // more generous plan wins); say so, or the purchased-plan line above reads
  // as a contradiction (feedback f2200b05).
  const freePeriod = useAppSelector(selectUsageGateFreePeriod);
  const freeUntil =
    freePeriod?.status === "active" && freePeriod.endsAt
      ? new Date(freePeriod.endsAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })
      : null;
  const windows = useAppSelector(selectUsageGateWindows);
  const fetchedAt = useAppSelector(selectUsageGateFetchedAt);
  const readFor = useRef<string | null>(null);
  const [reading, setReading] = useState(true);

  const read = () => {
    setReading(true);
    void refreshUsageInBackground(dispatch, store.getState).finally(() =>
      setReading(false),
    );
  };

  // One background refresh per visit, so the numbers here are current.
  useEffect(() => {
    if (!userId || readFor.current === userId) return;
    readFor.current = userId;
    read();
  });

  // What the card shows, for an agent on Settings -> Plan & usage (values owned by `matrx-user/settings`).
  useSurfaceScopeContribution("matrx-user/settings", "my-usage", () =>
    level === "unknown"
      ? { usage_read_failed: !reading }
      : {
          usage_state: {
            level,
            plan_name: planName ?? null,
            free_until: freeUntil,
            windows: windows.map((w) => ({
              window: windowLabel(w.period),
              used_points: w.used,
              limit_points: w.limit,
              remaining_points: w.remaining,
              resets_at: w.resetsAt,
              state: w.state,
            })),
          },
        },
  );

  const frame = cn("rounded-md border border-border bg-card", className);

  if (level === "unknown") {
    return (
      <div className={cn(frame, "p-3 sm:p-4")}>
        <h3 className="type-title text-foreground">Your AI usage</h3>
        {fetchedAt === null && reading ? (
          <div
            className="mt-3 space-y-2"
            aria-busy="true"
            aria-label="Reading your usage"
          >
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-1 w-full animate-pulse rounded-full bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-2">
            <p data-error-box className="type-body text-muted-foreground">
              We couldn&apos;t read your usage just now.
            <ErrorAlchemyMenu /></p>
            <Button icon={<RotateCw aria-hidden />} variant="outline" onClick={read}>
              Try again
            </Button>
          </div>
        )}
      </div>
    );
  }

  const chip = LEVEL_CHIP[level];
  return (
    <div className={frame}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-3 sm:p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="type-title text-foreground">
              Your AI usage
            </h3>
            <span
              className={cn(
                "inline-flex rounded px-1.5 py-0.5 type-meta font-medium",
                chip.tone,
              )}
            >
              {chip.text}
            </span>
          </div>
          {planName ? (
            <p className="mt-0.5 type-secondary text-muted-foreground">
              {planName} plan
              {freeUntil ? ` · free until ${freeUntil}` : ""}
            </p>
          ) : null}
        </div>
        <Button variant="outline" asChild>
          <Link href="/pricing">
            See plans
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </Button>
      </div>
      <div className="px-3 sm:px-4">
        {windows.length === 0 ? (
          <p className="py-3 type-body text-muted-foreground">
            Your plan sets no AI usage limits.
          </p>
        ) : (
          windows.map((w) => <WindowRow key={w.period} w={w} />)
        )}
      </div>
    </div>
  );
}
