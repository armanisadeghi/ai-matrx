"use client";

/**
 * features/hr/time/periods/components/PeriodStatePanel.tsx — ROUTE 33's header
 * (SPEC-UI-IA §3.4 row 33 names `PeriodStatePanel`).
 *
 * 🚨 THE TWO STATE MACHINES ARE LABELLED DISTINCTLY AND SIT IN SEPARATE BLOCKS (SPEC-TIME §14 D8):
 *
 *   • **This period** — `hr.pay_period.state`. One badge, seven possible values.
 *   • **Timecards in it** — `hr.pay_period_employment.state`. A progress line reading
 *     `"N of M timecards approved"`, plus the per-state counts.
 *
 * They share three token spellings and mean different things. Approving one person NEVER moves the
 * period, and a reader who conflates the two will believe a period is approved because a person is.
 *
 * 🚨 THE DISAGREEMENT SENTENCE IS ALWAYS IN WORDS, never a badge alone: *"3 timecards are approved
 * with an open disagreement. The disagreement travels to the export."* Approving over a preserved
 * disagreement is legitimate and recorded; the export carries the dispute as evidence and never
 * quietly resolves it by exporting the manager's number.
 *
 * NO CLIENT COMPUTES ANYTHING — every count is `period.counts`, straight from the server.
 */

import { AlertTriangle } from "lucide-react";

import type { HrFixtureCase } from "@/features/hr/mock/transport";
import { formatLocalDate } from "../../shared/format";
import type { PayPeriodRow } from "../../api/types";
import {
  PERIOD_STATE_MEANING,
  disputeSentence,
  rowProgressSentence,
  type PeriodViewerRole,
} from "../periodStateMachine";
import { PeriodTransitionBar } from "./PeriodTransitionBar";
import { StateBadge } from "./StateBadge";

export interface PeriodStatePanelProps {
  period: PayPeriodRow;
  role: PeriodViewerRole;
  allowPeriodReopen: boolean;
  todayLocalDate: string;
  mockCase?: HrFixtureCase;
  onTransitioned: () => void;
}

export function PeriodStatePanel({
  period,
  role,
  allowPeriodReopen,
  todayLocalDate,
  mockCase,
  onTransitioned,
}: PeriodStatePanelProps) {
  const disputes = disputeSentence(period.counts.disputed);

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">{period.payGroupName}</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {formatLocalDate(period.periodStartOn, { year: true })} –{" "}
              {formatLocalDate(period.periodEndOn, { year: true })}
              {period.payDate
                ? ` · pay date ${formatLocalDate(period.payDate, { year: true })}`
                : ""}
            </p>
          </div>
        </div>
      </div>

      {/* ── MACHINE 1: the PERIOD ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-border p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          This period
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <StateBadge machine="period" state={period.state} />
          <span className="text-[12px] text-muted-foreground">
            {PERIOD_STATE_MEANING[period.state]}
          </span>
        </div>
        {period.reopenReason ? (
          <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-800 dark:text-amber-300">
            Reopened{period.reopenedAt ? ` ${formatLocalDate(period.reopenedAt.slice(0, 10), { year: true })}` : ""}:{" "}
            {period.reopenReason}
          </p>
        ) : null}
      </div>

      {/* ── MACHINE 2: the TIMECARD ROWS. Different machine, different words. ─────────────── */}
      <div className="border-b border-border p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Timecards in it
        </p>
        <p className="mt-1.5 text-sm font-medium text-foreground">{rowProgressSentence(period)}</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Approving one person&apos;s timecard never moves the period. The period moves when someone
          moves it, above.
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4">
          <Count label="Awaiting decision" value={period.counts.open} />
          <Count label="Employee attested" value={period.counts.attested} />
          <Count label="With a disagreement" value={period.counts.disputed} />
          <Count label="Manager approved" value={period.counts.approved} />
        </dl>

        {disputes ? (
          <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              {disputes} This does not block approval — the disagreement is preserved in the
              employee&apos;s own words and travels to the export as evidence.
            </span>
          </p>
        ) : null}
      </div>

      <div className="p-4">
        <PeriodTransitionBar
          period={period}
          role={role}
          allowPeriodReopen={allowPeriodReopen}
          todayLocalDate={todayLocalDate}
          mockCase={mockCase}
          onTransitioned={onTransitioned}
        />
      </div>
    </section>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
