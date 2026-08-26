"use client";

/**
 * features/hr/time/exports/components/RunVerdictNotice.tsx — FREEZE §4 D-13, on screen.
 *
 * 🚨 `partial` IS A REAL TERMINAL STATE, NOT A ROUNDING OF `succeeded`, AND **A RUN REPORTED
 * COMPLETE WITH A NON-EMPTY `failed_units` IS NOT A SUCCESS.**
 *
 * A recompute that finished 410 of 412 workweeks produced 410 correct answers and 2 that must be
 * SEEN. This component therefore never renders a partial run under a success banner, and it lists
 * every failed unit individually with its own error — a count is not actionable, and "2 units
 * failed" tells a payroll administrator nothing about whether payroll can go ahead.
 *
 * The classification lives in `../exportPresentation.ts` (`classifyRun`) so it can be proven from a
 * non-browser client; this file only draws it.
 *
 * MOCK HONESTY: `useExportRun` reports `not_observable` under `NEXT_PUBLIC_HR_MOCK=1`, because the
 * runtime spine is a live path with no fixtures. Saying so is better than a spinner that never
 * resolves — a spinner that never resolves is the same failure wearing a nicer hat.
 */

import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";

import { announceComingSoon } from "@/lib/coming-soon/announce";
import { Button } from "@/components/ui/button";
import type { ExportRunPhase } from "@/features/hr/exports/hooks/useExportRun";
import type { AsyncAccepted } from "@/features/hr/exports/types";
import { classifyRun, type RunEnvelope } from "../exportPresentation";

export interface RunVerdictNoticeProps {
  phase: ExportRunPhase;
  accepted: AsyncAccepted | null;
  /** The runtime status string, and (where we have it) the HR result object. */
  envelope: RunEnvelope | null;
  failureMessage: string | null;
  onDismiss: () => void;
}

export function RunVerdictNotice({
  phase,
  accepted,
  envelope,
  failureMessage,
  onDismiss,
}: RunVerdictNoticeProps) {
  if (phase === "idle" || !accepted) return null;

  const verdict = classifyRun(envelope);

  // 🚨 The partial branch is checked FIRST and independently of `phase`: the spine can report a run
  // as terminal-and-completed while the HR result carries failures, and D-13 says the failures win.
  if (verdict.kind === "partial") {
    return (
      <Shell
        tone="warn"
        icon={<AlertTriangle className="h-4 w-4" aria-hidden />}
        title="This run did not fully succeed"
        onDismiss={onDismiss}
      >
        <p>{verdict.sentence}</p>
        {verdict.failedUnits.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {verdict.failedUnits.map((unit, i) => (
              <li
                key={`${unit.workweek_id ?? unit.employment_id ?? "unit"}-${i}`}
                className="rounded-md border border-amber-500/30 bg-background/50 px-2.5 py-1.5"
              >
                <p className="text-[12px] text-foreground">
                  {unit.message ?? unit.error ?? "The engine did not say what went wrong."}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {unit.error ? (
                    <span className="font-mono text-[10px] text-muted-foreground">{unit.error}</span>
                  ) : null}
                  {unit.workweek_id ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 font-mono text-[10px]"
                      onClick={() => void announceComingSoon("hr.workweek-detail")}
                    >
                      {unit.workweek_id.slice(0, 8)}…
                    </Button>
                  ) : null}
                  {unit.employment_id ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 font-mono text-[10px]"
                      onClick={() => void announceComingSoon("hr.employment-record")}
                    >
                      {unit.employment_id.slice(0, 8)}…
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </Shell>
    );
  }

  if (phase === "not_observable") {
    return (
      <Shell
        tone="info"
        icon={<Info className="h-4 w-4" aria-hidden />}
        title="Accepted — but this environment cannot watch it"
        onDismiss={onDismiss}
      >
        <p>
          The server took the request (
          <span className="font-mono text-[11px]">{accepted.request_id.slice(0, 8)}…</span>). Mock
          mode swaps the HR transport only; the runtime spine that reports progress is a live path
          with no fixtures, so there is nothing here to follow. On a real server this is where the
          run&apos;s progress appears.
        </p>
      </Shell>
    );
  }

  if (phase === "running") {
    return (
      <Shell
        tone="info"
        icon={<Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        title="Building the payroll file"
        onDismiss={onDismiss}
      >
        <p>
          This is a server run, not a browser session — closing this tab loses nothing and the file
          finishes either way.
        </p>
      </Shell>
    );
  }

  if (phase === "timed_out") {
    return (
      <Shell
        tone="warn"
        icon={<AlertTriangle className="h-4 w-4" aria-hidden />}
        title="Still running"
        onDismiss={onDismiss}
      >
        <p>
          This run has not settled yet. It has not failed — it is still a server row. Refresh the
          history to see where it got to rather than waiting on a spinner.
        </p>
      </Shell>
    );
  }

  if (phase === "failed" || verdict.kind === "failed") {
    return (
      <Shell
        tone="error"
        icon={<XCircle className="h-4 w-4" aria-hidden />}
        title="The run failed"
        onDismiss={onDismiss}
      >
        <p>{failureMessage ?? "The engine ended this run without producing a file."}</p>
        <p className="mt-1.5 text-muted-foreground">
          No payroll file was produced, so nothing was delivered and nothing was paid. The failure is
          recorded.
        </p>
      </Shell>
    );
  }

  return (
    <Shell
      tone="ok"
      icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}
      title="The payroll file is ready"
      onDismiss={onDismiss}
    >
      <p>It appears in the export history below with its version and checksum.</p>
    </Shell>
  );
}

function Shell({
  tone,
  icon,
  title,
  children,
  onDismiss,
}: {
  tone: "ok" | "info" | "warn" | "error";
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  onDismiss: () => void;
}) {
  const toneClass = {
    ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
    info: "border-border bg-muted/50 text-foreground",
    warn: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
    error: "border-destructive/40 bg-destructive/10 text-destructive",
  }[tone];

  return (
    <section className={`rounded-md border px-3 py-2.5 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <h4 className="flex items-center gap-2 text-[12px] font-semibold">
          {icon}
          {title}
        </h4>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[11px] underline underline-offset-2 opacity-80 hover:opacity-100"
        >
          Dismiss
        </button>
      </div>
      <div className="mt-1 text-[12px] leading-relaxed">{children}</div>
    </section>
  );
}
