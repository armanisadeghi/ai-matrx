"use client";

import { Zap, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "../../lib/formulas";
import type { StatelessRatingResponse } from "../../api/types";
import type { LiveRatingState } from "../../state/useLiveRating";

interface ResultPanelProps {
  liveState: LiveRatingState;
  className?: string;
}

const SIDE_LABELS: Record<string, string> = {
  left: "Left",
  right: "Right",
  default: "Bilateral",
};

/**
 * Slim summary panel sized to roughly match the ClaimHeader card so the
 * Injuries table below doesn't shift as the rating fills in. The detailed
 * per-injury breakdown lives in a full-width table below the injuries
 * (see `RatingBreakdownTable`) — keep this panel focused on the headline
 * number and per-side totals.
 */
export function ResultPanel({ liveState, className }: ResultPanelProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm",
        className,
      )}
    >
      <ResultBody liveState={liveState} />
    </section>
  );
}

function ResultBody({ liveState }: { liveState: LiveRatingState }) {
  if (liveState.status === "incomplete") {
    return (
      <EmptyState
        icon={Zap}
        title="Your rating will appear here"
        description={
          liveState.reason ?? "Fill in the claim and add at least one injury."
        }
      />
    );
  }

  if (liveState.status === "error") {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Couldn't compute the rating"
        description={
          liveState.error?.message ??
          "Something went wrong. Adjust your inputs and try again."
        }
        tone="destructive"
      />
    );
  }

  if (liveState.status === "calculating" && !liveState.result) {
    return (
      <EmptyState
        icon={Loader2}
        title="Calculating…"
        description="Crunching the numbers"
        spinning
      />
    );
  }

  if (!liveState.result) {
    return (
      <EmptyState
        icon={Zap}
        title="Your rating will appear here"
        description="Fill in the claim and add at least one injury."
      />
    );
  }

  return (
    <ResolvedResult
      result={liveState.result}
      isStale={liveState.status === "calculating"}
    />
  );
}

function ResolvedResult({
  result,
  isStale,
}: {
  result: StatelessRatingResponse;
  isStale: boolean;
}) {
  const combined = result.result?.combined_rating;
  const compensation = result.result?.compensation;
  const finalRating = combined?.final_rating;

  return (
    <div
      className={cn("space-y-5", isStale && "opacity-70 transition-opacity")}
    >
      <header>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Final PD rating
          </p>
          {isStale && (
            <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
          )}
        </div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="font-mono tracking-tight tabular-nums text-foreground text-5xl sm:text-6xl font-semibold leading-none">
            {finalRating != null ? formatNumber(finalRating, 0) : "—"}
          </span>
          <span className="font-mono text-2xl sm:text-3xl font-semibold text-muted-foreground">
            %
          </span>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3 pt-4 border-t border-border/60">
        <Metric
          label="Compensation"
          value={
            compensation?.compensation != null
              ? formatCurrency(compensation.compensation)
              : "—"
          }
        />
        <Metric
          label="Weeks"
          value={
            compensation?.weeks != null
              ? formatNumber(compensation.weeks, 2)
              : "—"
          }
        />
        <Metric
          label="Days"
          value={
            compensation?.days != null
              ? formatNumber(compensation.days, 0)
              : "—"
          }
        />
      </div>

      {/* Weekly + Daily rate (Phase 3). Only render when the calc has run
          and produced a non-null weekly_payment. Cast through `unknown`
          because `weekly_payment` and friends aren't in the regenerated TS
          types until `pnpm sync-types` runs again — values exist on the
          wire today regardless. */}
      {(() => {
        const ext = compensation as unknown as
          | {
              weekly_payment?: number | null;
              daily_rate?: number | null;
              pd_adjustment_pct?: number | null;
              pd_adjustment_reason?: string | null;
              life_pension_weekly?: number | null;
            }
          | undefined;
        const showRates =
          ext?.weekly_payment != null && ext.weekly_payment > 0;
        const adjustmentPct = ext?.pd_adjustment_pct ?? 0;
        const adjustmentReason = ext?.pd_adjustment_reason ?? "";
        const lp = ext?.life_pension_weekly ?? 0;
        return (
          <>
            {showRates && (
              <div className="grid grid-cols-2 gap-3 pt-3">
                <Metric
                  label="Weekly rate"
                  value={formatCurrency(ext.weekly_payment ?? 0)}
                />
                <Metric
                  label="Daily rate"
                  value={formatCurrency(ext.daily_rate ?? 0)}
                />
              </div>
            )}

            {adjustmentPct !== 0 && (
              <div
                className={cn(
                  "mt-3 rounded-lg border px-3 py-2 text-xs",
                  adjustmentPct > 0
                    ? "border-emerald-200/60 bg-emerald-50/40 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300"
                    : "border-amber-200/60 bg-amber-50/40 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300",
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="font-semibold">
                    LC §4658(d) adjustment
                  </span>
                  <span className="font-mono tabular-nums font-semibold">
                    {adjustmentPct > 0 ? "+" : ""}
                    {adjustmentPct}%
                  </span>
                </div>
                {adjustmentReason && (
                  <p className="text-[11px] opacity-90">{adjustmentReason}</p>
                )}
              </div>
            )}

            {lp > 0 && (
              <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Life pension (LC §4659)
                  </span>
                  <span className="font-mono tabular-nums text-base font-semibold text-foreground">
                    {formatCurrency(lp)} / wk
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Paid for life after the regular PD payments end.
                </p>
              </div>
            )}
          </>
        );
      })()}

      {combined?.ratings && Object.keys(combined.ratings).length > 0 && (
        <div className="pt-4 border-t border-border/60">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2.5">
            Per-side breakdown
          </p>
          <div className="space-y-1.5">
            {Object.entries(combined.ratings).map(([side, sideData]) => (
              <SideRow
                key={side}
                label={SIDE_LABELS[side] ?? side}
                total={sideData.total}
              />
            ))}
          </div>
        </div>
      )}

      {combined?.warnings && combined.warnings.length > 0 && (
        <div className="pt-4 border-t border-border/60">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2">
            Notes
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {combined.warnings.map((w, idx) => (
              <li key={idx} className="flex gap-1.5">
                <span aria-hidden>•</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 font-mono tabular-nums text-base sm:text-lg font-semibold text-foreground truncate">
        {value}
      </p>
    </div>
  );
}

function SideRow({ label, total }: { label: string; total: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums font-semibold text-foreground">
        {formatNumber(total, 0)}%
      </span>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  tone = "neutral",
  spinning = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  tone?: "neutral" | "destructive";
  spinning?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center min-h-[280px] py-8">
      <div
        className={cn(
          "rounded-full p-3 mb-4 ring-1",
          tone === "destructive"
            ? "bg-destructive/10 text-destructive ring-destructive/20"
            : "bg-primary/10 text-primary ring-primary/15",
        )}
      >
        <Icon className={cn("h-5 w-5", spinning && "animate-spin")} />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground max-w-xs">
        {description}
      </p>
    </div>
  );
}
