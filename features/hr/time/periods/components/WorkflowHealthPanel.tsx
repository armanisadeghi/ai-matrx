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

import { AlertTriangle, CheckCircle2, CircleDashed, Clock, ShieldAlert, UserX } from "lucide-react";

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
  unreachableWords,
  isNotAttestedTerminal,
} from "../workflowHealth";

const HEALTH_TONE: Record<RowHealth, string> = {
  awaiting: "bg-primary/10 text-primary border-primary/30",
  stuck: "bg-destructive/10 text-destructive border-destructive/40",
  no_flow: "bg-muted text-muted-foreground border-border",
  /*
   * Amber, not the destructive red of `stuck`. Nothing has FAILED here — the flow is intact and no
   * person is at fault; it simply has nobody to route to. Reading it as a failure sends a payroll
   * administrator looking for a broken thing to fix instead of a missing person to assign.
   */
  unreachable: "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/40",
  done: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
};

const HEALTH_ICON: Record<RowHealth, typeof Clock> = {
  awaiting: Clock,
  stuck: ShieldAlert,
  no_flow: CircleDashed,
  unreachable: UserX,
  done: CheckCircle2,
};

export interface WorkflowHealthPanelProps {
  workflow: PeriodWorkflowHealth;
  /** Opens the employment behind a row. Every identity the UI names must open. */
  hrefForEmployment?: (employmentId: string) => string;
}

export function WorkflowHealthPanel({ workflow, hrefForEmployment }: WorkflowHealthPanelProps) {
  const { awaiting, stuck, noFlow, unreachable, done, rows } = workflow;
  const total = awaiting + stuck + noFlow + unreachable + done;

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
  // 🚨 THE SAME OR AS THE ROW BADGE, AND FOR THE SAME REASON. Counting only the flow terminal
  // missed every row where the outcome had been projected onto the timecard but the instance was
  // still marked active — which is the ordinary case after a sweep closes the step. The summary
  // read zero while a row underneath it plainly said "Not attested".
  const notAttested = rows.filter(
    (r) => r.attestationOutcome === "not_attested" || isNotAttestedTerminal(r),
  );
  // 🚨 The ruling's distinction, counted: a person who holds no login was never asked,
  // so they are not part of any "did not respond" total.
  const neverAskable = rows.filter((r) => r.attestationReason === "no_reach");
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

        {/* Five columns now: `unreachable` is its own count because it is its own answer. */}
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-5">
          <HealthCount health="awaiting" value={awaiting} />
          <HealthCount health="stuck" value={stuck} />
          <HealthCount health="unreachable" value={unreachable} />
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

        {notAttested.length > 0 ? (
          <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {/*
              🚨 THIS BANNER USED TO SAY THEY WERE "never attested by the deadline and are flagged
              for a manager". Both halves could be false at once. An employee with no platform login
              was never asked, so "by the deadline" charges them with missing something they were
              never shown; and the engine records `notified_as: 'nobody'` when no recipient could be
              resolved, so the flag is a per-close fact this summary cannot see. What is always true
              is the part that matters for money: nothing here was treated as agreed.
            */}
            <span>
              {notAttested.length === 1
                ? "1 timecard closed"
                : `${notAttested.length} timecards closed`}{" "}
              without the employee confirming{" "}
              {notAttested.length === 1 ? "it" : "them"}. Nothing here was treated as agreed.
              {neverAskable.length > 0 ? (
                <>
                  {" "}
                  {neverAskable.length === 1
                    ? "One of them could never be asked: that employee holds no platform login,"
                    : `${neverAskable.length} of them could never be asked: those employees hold no platform login,`}{" "}
                  so no surface could reach them.
                </>
              ) : null}
            </span>
          </p>
        ) : null}
      </div>

      <ul className="divide-y divide-border">
        {rows.map((row) => {
          const Icon = HEALTH_ICON[row.health];
          const words = failureWords(row.failureClass);
          const outcome = attestationOutcomeSentence(row);
          /*
            🚨 WHO is missing comes from the STEP, never from the row's person. On a self step the
            assignee IS the subject; on an approval step it is somebody else, and saying "this
            employee cannot be reached" there points payroll at the wrong person entirely.
          */
          const unreachable =
            row.health === "unreachable" ? unreachableWords(row.unreachableStepKey) : null;
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

                {/*
                  🚨 ONE BADGE, AND IT DOES NOT CLAIM A NOTIFICATION.
                  There were two here: "Not attested" from the outcome, and "Flagged for a manager"
                  from the flow terminal — the same fact, twice, and the second one asserting D285's
                  claim. Whether anybody was actually told is decided at close time and read back
                  from how many notices were written; the period payload does not carry it, so this
                  badge cannot say it. The row's sentence below does, because the server composes it
                  from what actually happened.

                  The two conditions are OR'd rather than dropped: the outcome is projected onto the
                  timecard row while the terminal lives on the flow, and a row can carry either one
                  first. Reading only one is how a not-attested timecard renders as unremarkable.
                */}
                {row.attestationOutcome === "not_attested" || isNotAttestedTerminal(row) ? (
                  <span
                    title={
                      row.attestationReason === "no_reach"
                        ? "Closed without a confirmation. This employee holds no platform login, so they were never asked. Nothing attested on their behalf."
                        : "Closed without the employee confirming these hours. Nothing attested on their behalf."
                    }
                    className="inline-flex items-center rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300"
                  >
                    Not attested
                  </span>
                ) : null}

                {/*
                  🚨 THE PERSON, NOT A UUID PREFIX. This panel's whole job is saying whether
                  anybody was actually ASKED, and it spent four rounds answering with
                  `4c32b064…` — which names nobody a payroll administrator could go and speak to.
                  The name comes from the DOOR (`subject_name`, via the one suppression-aware
                  rule), never a client-side join. When it is null the viewer may not have the
                  name, so the id stays as a bare REFERENCE rather than the panel inventing one.
                */}
                {hrefForEmployment ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn("h-6 text-[11px]", !row.subjectName && "font-mono text-[10px]")}
                    title={`Record reference ${row.employmentId}`}
                    onClick={() => void announceComingSoon("hr.employment-record")}
                  >
                    {row.subjectName ?? `${row.employmentId.slice(0, 8)}…`}
                  </Button>
                ) : (
                  <span
                    className={cn(
                      "text-[11px] text-foreground",
                      !row.subjectName && "font-mono text-[10px] text-muted-foreground",
                    )}
                    title={`Record reference ${row.employmentId}`}
                  >
                    {row.subjectName ?? `${row.employmentId.slice(0, 8)}…`}
                  </span>
                )}

                {/*
                  🚨 THE PRECISE STATE, NOT THE VAGUE ONE. `row is open` is the row-state machine
                  talking, and `open` is exactly the value that cannot tell "waiting on a person"
                  from "flow is dead" — the ambiguity this panel exists to remove. The health
                  MEANING is the server's own classification said out loud; the raw row state stays
                  reachable on hover for anyone reconciling against the table.
                */}
                <span className="text-[11px] text-muted-foreground" title={`row state: ${row.rowState}`}>
                  {HEALTH_MEANING[row.health]}
                  {row.flowKey ? ` · ${row.flowKey}` : ""}
                  {row.instanceState ? ` · instance ${row.instanceState}` : ""}
                </span>
              </div>

              {unreachable ? (
                <p className="mt-1 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                  {unreachable}
                </p>
              ) : null}

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

              {/*
                The server's own note, ONLY when the outcome sentence has not already said it.
                🚨 This was an equality check, and it printed the whole note TWICE the moment the
                outcome sentence started carrying it — the sentence is the note plus a manager
                clause, so it is never EQUAL to the note and the "is this already shown?" test
                silently inverted. Containment is the question actually being asked.
              */}
              {row.attestationNote && !outcome?.includes(row.attestationNote) ? (
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
