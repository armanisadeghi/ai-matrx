"use client";

/**
 * features/hr/time/periods/components/WorkflowHealthPanel.tsx — T3.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 🚨 WHAT THE ROW-STATE COUNTS CANNOT SAY, AND WHY THIS PANEL EXISTS.
 *
 * `hr.pay_period_employment.state = 'open'` means "nobody has decided this timecard yet". It does
 * NOT distinguish between:
 *
 *   • a timecard genuinely **waiting on a person** — the flow is alive, somebody has been asked; and
 *   • a timecard whose **flow is dead** — the instance failed, nobody was ever asked, and no amount
 *     of waiting will move it.
 *
 * Both render as `open`. That is exactly how a stuck period looked "awaiting" for four review
 * rounds while it could never actually be approved. The server now classifies each row's health,
 * and this panel is the surface that finally says the difference out loud.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 🚨 A ROW CAN BE `awaiting` AND STILL CARRY AN OPEN FAILURE, and that combination is the one that
 * hides. `failure_class` is independent of `health`: the instance may have been retried back into
 * `active` while the failure it raised is still unresolved. The rollup counts it as healthy; it is
 * not. So a failure is rendered wherever it exists, at ANY health — never only under `stuck`.
 *
 * 🚨 EVERY STATE IS WORDED, NEVER A RAW TOKEN. `approver_ineligible` is a machine string; *"the
 * person who should decide cannot"* is what a payroll administrator can act on. An unrecognised
 * class still renders — as itself, labelled as unrecognised — because swallowing it would recreate
 * the exact blindness this panel was built to remove.
 *
 * NO CLIENT COMPUTES ANYTHING: every count and classification is the server's.
 */

import { AlertTriangle, CheckCircle2, CircleDashed, Clock, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import { Button } from "@/components/ui/button";
import type { PeriodWorkflowHealth, RowHealth } from "../api/periodReads";
// The vocabulary lives in a React-free module so the headless proof can assert it.
import {
  HEALTH_LABEL,
  HEALTH_MEANING,
  approvedWithoutAttestation,
  attestationOutcomeSentence,
  failureWords,
  isManagerFlagged,
} from "../workflowHealth";

const HEALTH_TONE: Record<RowHealth, string> = {
  awaiting: "bg-primary/10 text-primary border-primary/30",
  stuck: "bg-destructive/10 text-destructive border-destructive/40",
  no_flow: "bg-muted text-muted-foreground border-border",
  done: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
};

const HEALTH_ICON: Record<RowHealth, typeof Clock> = {
  awaiting: Clock,
  stuck: ShieldAlert,
  no_flow: CircleDashed,
  done: CheckCircle2,
};

export interface WorkflowHealthPanelProps {
  workflow: PeriodWorkflowHealth;
  /** Opens the employment behind a row. Every identity the UI names must open. */
  hrefForEmployment?: (employmentId: string) => string;
}

export function WorkflowHealthPanel({ workflow, hrefForEmployment }: WorkflowHealthPanelProps) {
  const { awaiting, stuck, noFlow, done, rows } = workflow;
  const total = awaiting + stuck + noFlow + done;

  if (total === 0) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-[13px] font-semibold text-foreground">Attestation progress</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          This period has no timecard rows yet, so there is no attestation to track. Rows appear when
          eligible employments are enrolled into the period.
        </p>
      </section>
    );
  }

  // A failure at ANY health — the `awaiting`-with-an-open-failure case included.
  const withFailure = rows.filter((r) => r.failureClass !== null);
  const flagged = rows.filter(isManagerFlagged);
  // Money moved on hours the subject never confirmed — §7.1's case, read from the record.
  const unconfirmed = rows.filter(approvedWithoutAttestation);

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border p-4">
        <h3 className="text-[13px] font-semibold text-foreground">Attestation progress</h3>
        <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
          Whether each timecard is waiting on a <em>person</em> or on a <em>flow that has died</em>.
          The counts above this say how many are undecided; these say whether anybody was actually
          asked.
        </p>

        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          <HealthCount health="awaiting" value={awaiting} />
          <HealthCount health="stuck" value={stuck} />
          <HealthCount health="no_flow" value={noFlow} />
          <HealthCount health="done" value={done} />
        </dl>

        {stuck > 0 ? (
          <p className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] leading-relaxed text-destructive">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              {stuck === 1
                ? "1 timecard's flow has failed."
                : `${stuck} timecards' flows have failed.`}{" "}
              Waiting will not move {stuck === 1 ? "it" : "them"}. This period cannot be approved
              until {stuck === 1 ? "it is" : "they are"} dealt with.
            </span>
          </p>
        ) : null}

        {/* 🚨 The hiding case: healthy-looking rollup, unresolved failure underneath. */}
        {stuck === 0 && withFailure.length > 0 ? (
          <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              {withFailure.length === 1
                ? "1 timecard is counted as progressing but still carries an unresolved failure."
                : `${withFailure.length} timecards are counted as progressing but still carry unresolved failures.`}{" "}
              The flow was retried; the problem it hit has not been cleared.
            </span>
          </p>
        ) : null}

        {/*
          🚨 U2 — THE SENTENCE THAT REPLACES SUBTRACTION. "Employee attested 0 / Manager approved 1"
          is arithmetic a manager should never have to do about whether somebody confirmed the hours
          they were paid for. Read from the record; absent if the server did not say so.
        */}
        {unconfirmed.length > 0 ? (
          <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              {unconfirmed.length === 1
                ? "1 timecard was approved without its employee ever confirming the hours."
                : `${unconfirmed.length} timecards were approved without their employees ever confirming the hours.`}{" "}
              That is allowed and it is recorded — but nothing here was attested on anyone&apos;s
              behalf.
            </span>
          </p>
        ) : null}

        {flagged.length > 0 ? (
          <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              {flagged.length === 1 ? "1 timecard was" : `${flagged.length} timecards were`} never
              attested by the deadline and {flagged.length === 1 ? "is" : "are"} flagged for a
              manager. Nothing here was treated as agreed.
            </span>
          </p>
        ) : null}
      </div>

      <ul className="divide-y divide-border">
        {rows.map((row) => {
          const Icon = HEALTH_ICON[row.health];
          const words = failureWords(row.failureClass);
          const outcome = attestationOutcomeSentence(row);
          return (
            <li key={row.payPeriodEmploymentId} className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  title={HEALTH_MEANING[row.health]}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium",
                    HEALTH_TONE[row.health],
                  )}
                >
                  <Icon className="h-3 w-3" aria-hidden />
                  {row.health === "stuck" && words
                    ? `Stuck — ${words.split(" — ")[0]}`
                    : HEALTH_LABEL[row.health]}
                </span>

                {row.attestationOutcome === "not_attested" ? (
                  <span
                    title="The employee never confirmed these hours. Nothing attested on their behalf."
                    className="inline-flex items-center rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300"
                  >
                    Not attested
                  </span>
                ) : null}

                {isManagerFlagged(row) ? (
                  <span className="inline-flex items-center rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
                    Flagged for a manager
                  </span>
                ) : null}

                {/* The identity, as a door. */}
                {hrefForEmployment ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 font-mono text-[10px]"
                    onClick={() => void announceComingSoon("hr.employment-record")}
                  >
                    {row.employmentId.slice(0, 8)}…
                  </Button>
                ) : (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {row.employmentId.slice(0, 8)}…
                  </span>
                )}

                <span className="text-[11px] text-muted-foreground">
                  row is {row.rowState}
                  {row.flowKey ? ` · ${row.flowKey}` : ""}
                  {row.instanceState ? ` · instance ${row.instanceState}` : ""}
                </span>
              </div>

              {/*
                🚨 THE OUTCOME, ON THE ROW. The server's own note wins verbatim when it sent one;
                otherwise the composed sentence. Never rendered from an inference — if the record
                did not say, this is silent.
              */}
              {outcome ? (
                <p
                  className={cn(
                    "mt-1.5 text-[12px] leading-relaxed",
                    approvedWithoutAttestation(row)
                      ? "text-amber-800 dark:text-amber-300"
                      : "text-muted-foreground",
                  )}
                >
                  {outcome}
                </p>
              ) : null}

              {/* The server's own note, when it added one beyond the outcome sentence. */}
              {row.attestationNote && row.attestationNote !== outcome ? (
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {row.attestationNote}
                </p>
              ) : null}

              {/* 🚨 A failure shows at ANY health, in words. */}
              {words ? (
                <p
                  className={cn(
                    "mt-1.5 text-[12px] leading-relaxed",
                    row.health === "stuck"
                      ? "text-destructive"
                      : "text-amber-800 dark:text-amber-300",
                  )}
                >
                  {row.health === "stuck" ? "This has failed because " : "Unresolved: "}
                  {words}.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function HealthCount({ health, value }: { health: RowHealth; value: number }) {
  return (
    <div title={HEALTH_MEANING[health]}>
      <dt className="text-[11px] text-muted-foreground">{HEALTH_LABEL[health]}</dt>
      <dd
        className={cn(
          "text-sm font-medium tabular-nums",
          health === "stuck" && value > 0 ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
