// features/window-panels/windows/spend/DailySpendWindow.tsx
//
// THE DAILY SPEND POPOVER. Arman, 2026-09-11: "floating window popovers that
// come up once a day or a couple times a day… The key is to scare me by showing
// me how much money we spent so far today, not by putting blocks in the code."
//
// It WRAPS the canonical headline (`features/admin/spend/SpendHeadline.tsx`),
// the same component the dashboard renders — a window panel wraps the canonical
// component, never a hand-rolled copy. Everything it adds is the two doors out:
// Dismiss (no more today) and Open spend dashboard.
//
// It blocks nothing and it never hides anything. Above the
// `platform.spend_popover.scare_threshold_usd` knob the number turns
// destructive-toned; that is the whole intervention.
//
// Doc: features/admin/spend/FEATURE.md

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight } from "lucide-react";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { SpendHeadline } from "@/features/admin/spend/SpendHeadline";
import { fetchSpendHeadline, viewerTimezone } from "@/features/admin/spend/service";
import { usd } from "@/features/admin/spend/format";
import { recordDismissed } from "@/features/admin/spend/dailySpendPopoverState";
import { useSpendPopoverKnobs } from "@/features/admin/spend/useSpendPopoverKnobs";
import type { SpendHeadlineSnapshot } from "@/features/admin/spend/types";

export interface DailySpendWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DailySpendWindow(props: DailySpendWindowProps) {
  if (!props.isOpen) return null;
  return <DailySpendWindowInner {...props} />;
}

function DailySpendWindowInner({ onClose }: DailySpendWindowProps) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<SpendHeadlineSnapshot | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const knobsState = useSpendPopoverKnobs();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await fetchSpendHeadline(viewerTimezone());
        if (!cancelled) setSnapshot(next);
      } catch (cause) {
        if (cancelled) return;
        setError(
          cause instanceof Error
            ? cause
            : new Error("Today's spend could not be read."),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Closing this window IS the dismissal — the title-bar X and the button mean
  // the same thing, so neither can leave it re-opening an hour later.
  const dismiss = () => {
    recordDismissed();
    onClose();
  };

  return (
    <WindowPanel
      id="daily-spend-window"
      overlayId="dailySpendWindow"
      title="Spend so far today"
      width={620}
      height={430}
      minWidth={420}
      minHeight={320}
      position="center"
      onClose={dismiss}
      bodyClassName="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"
    >
      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <div className="font-medium">Today&apos;s spend could not be read.</div>
            <p className="mt-1 text-xs">
              {error.message} — so no number is shown rather than a wrong one.
              Open the dashboard below to retry.
            </p>
          </div>
        </div>
      ) : null}

      {knobsState.error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-[11px] text-destructive">
          The alarm threshold setting could not be read, so the figure below will
          not change colour however high today runs.
        </div>
      ) : null}

      {snapshot ? (
        <>
          <SpendHeadline
            today={snapshot.today}
            todayRuns={snapshot.todayRuns}
            yesterday={snapshot.yesterday}
            last7d={snapshot.last7d}
            monthToDate={snapshot.monthToDate}
            scareThresholdUsd={
              knobsState.knobs?.scareThresholdUsd ?? Number.POSITIVE_INFINITY
            }
            timezone={snapshot.timezone}
            density="compact"
          />

          <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <div>
              Biggest spender today:{" "}
              <span className="font-medium text-foreground">
                {snapshot.topOrg ? snapshot.topOrg.name : "nothing recorded yet"}
              </span>
              {snapshot.topOrg ? ` · ${usd(snapshot.topOrg.cost)}` : ""}
            </div>
            <div>
              {snapshot.gapCount} cost sources measure nothing, so the figure
              above is a lower bound.
            </div>
          </div>
        </>
      ) : error ? null : (
        <div className="flex flex-col gap-2">
          <div className="h-20 animate-pulse rounded-md bg-muted" />
          <div className="h-12 animate-pulse rounded-md bg-muted" />
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={dismiss}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
        >
          Dismiss for today
        </button>
        <button
          type="button"
          onClick={() => {
            recordDismissed();
            onClose();
            router.push("/administration/billing/spend");
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Open spend dashboard
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </WindowPanel>
  );
}
