"use client";

/**
 * features/hr/time/exports/components/ExportPreconditionNotice.tsx — SPEC-CONTRACTS §4.4's four
 * named refusals, each rendered with its own door.
 *
 * The classification is `classifyPrecondition` in `features/hr/exports/errors.ts` (lane L13) and is
 * **not re-derived here** — two of the four share a status AND a code (`409 hr_state_conflict`) and
 * are told apart only by which key `details` carries, so a second classifier would drift.
 *
 * 🚨 UNMAPPED IDENTIFIERS BLOCK **BEFORE** GENERATION, AND THE CODES ARE NAMED.
 * `400 hr_validation_error` with `details.unmapped[]` rather than a file with blanks in the
 * identifier column: a payroll file with a missing employee id is worse than no file, because it
 * fails silently downstream, in someone else's system, after money moved. Every affected employment
 * is listed individually — a count is not actionable.
 *
 * 🚨 AN ADVISORY RULE REFUSES THE **WHOLE RUN** — `422 hr_advisory_rule_blocks_money`. An export
 * refuses; it does not omit a line. This is deliberately different from what §7.3 does on the
 * timesheet, where the hours show and the amount is absent: there, a human reads a screen and can
 * see the gap; here, a file leaves the building and money moves. Both behaviours are built.
 *
 * `unknown` is shown with the server's own `user_message`, never dressed up as one of the four.
 */

import { AlertOctagon, FileWarning, Layers, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import type { ExportFailure } from "@/features/hr/exports/errors";
import type { ExportPrecondition } from "@/features/hr/exports/types";

export interface ExportPreconditionNoticeProps {
  precondition: ExportPrecondition;
  failure: ExportFailure;
}

export function ExportPreconditionNotice({
  precondition,
  failure,
}: ExportPreconditionNoticeProps) {
  switch (precondition.kind) {
    case "period_not_approved":
      return (
        <Shell
          tone="warn"
          icon={<Layers className="h-4 w-4" aria-hidden />}
          title="This period is not approved yet"
        >
          <p>{failure.userMessage}</p>
          <p className="mt-1.5 text-muted-foreground">
            The period is <span className="text-foreground">{precondition.state}</span>. Every
            timecard has to be decided, and the period approved, before a payroll file can be built.
          </p>
        </Shell>
      );

    case "pending_workweeks":
      return (
        <Shell
          tone="warn"
          icon={<Layers className="h-4 w-4" aria-hidden />}
          title="Some workweeks are still being calculated"
        >
          <p>{failure.userMessage}</p>
          <p className="mt-1.5 text-muted-foreground">
            A workweek that is not final has no settled overtime figure, so exporting it would
            export a number that is still moving. Each one is listed so it can be opened.
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {precondition.pendingWorkweekIds.map((id) => (
              <li key={id}>
                {/* Every identity the UI names must open. */}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 font-mono text-[11px]"
                  onClick={() => void announceComingSoon("hr.workweek-detail")}
                >
                  {id.slice(0, 8)}…
                </Button>
              </li>
            ))}
          </ul>
        </Shell>
      );

    case "advisory_rule_blocks_money":
      return (
        <Shell
          tone="block"
          icon={<ShieldAlert className="h-4 w-4" aria-hidden />}
          title="The whole run is refused — a rule behind an amount is not verified"
        >
          {/* The server's sentence, verbatim. */}
          <p>{failure.userMessage}</p>
          <p className="mt-1.5 text-muted-foreground">
            An export refuses; it does not quietly drop a line. A payroll file with a silently
            missing premium is the exact failure this rule exists to prevent — so nothing is
            generated until the rule is verified, and no zero is substituted anywhere.
          </p>
          <dl className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
            {precondition.ruleClass ? (
              <div>
                <dt className="inline">Rule class: </dt>
                <dd className="inline text-foreground">{precondition.ruleClass}</dd>
              </div>
            ) : null}
            {precondition.jurisdictionKey ? (
              <div>
                <dt className="inline">Jurisdiction: </dt>
                <dd className="inline text-foreground">{precondition.jurisdictionKey}</dd>
              </div>
            ) : null}
            {precondition.affectedEmploymentIds.length > 0 ? (
              <div>
                <dt className="inline">People affected: </dt>
                <dd className="inline text-foreground">
                  {precondition.affectedEmploymentIds.length}
                </dd>
              </div>
            ) : null}
          </dl>
          {precondition.ruleId ? (
            <div className="mt-2">
              {/* The door to the rule — §7.3 requires the flag to carry one. */}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                onClick={() => void announceComingSoon("hr.time-rule-detail")}
              >
                Open the rule
              </Button>
            </div>
          ) : null}
        </Shell>
      );

    case "unmapped_identifiers":
      return (
        <Shell
          tone="block"
          icon={<FileWarning className="h-4 w-4" aria-hidden />}
          title="Some people have no identifier for this format"
        >
          <p>{failure.userMessage}</p>
          <p className="mt-1.5 text-muted-foreground">
            Nothing is generated. A payroll file with a missing employee id is worse than no file: it
            fails silently in the receiving system, after money has moved. Map these first, or pick
            the generic CSV, which uses our own identifiers and needs no mapping.
          </p>
          <ul className="mt-2 space-y-1">
            {precondition.unmapped.map((entry) => (
              <li
                key={`${entry.employment_id}:${entry.field}`}
                className="flex flex-wrap items-center gap-2 text-[11px]"
              >
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 font-mono text-[11px]"
                  onClick={() => void announceComingSoon("hr.employment-record")}
                >
                  {entry.employment_id.slice(0, 8)}…
                </Button>
                <span className="text-muted-foreground">
                  missing <span className="text-foreground">{entry.field}</span>
                </span>
              </li>
            ))}
          </ul>
        </Shell>
      );

    default:
      return (
        <Shell
          tone="warn"
          icon={<AlertOctagon className="h-4 w-4" aria-hidden />}
          title="The export was refused"
        >
          {/* Not one of the four. Shown with the server's own words, never dressed up as one. */}
          <p>{failure.userMessage}</p>
          {failure.requestId ? (
            <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
              Request {failure.requestId}
            </p>
          ) : null}
        </Shell>
      );
  }
}

function Shell({
  tone,
  icon,
  title,
  children,
}: {
  tone: "warn" | "block";
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  const toneClass =
    tone === "block"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  return (
    <section className={`rounded-md border px-3 py-2.5 ${toneClass}`}>
      <h4 className="flex items-center gap-2 text-[12px] font-semibold">
        {icon}
        {title}
      </h4>
      <div className="mt-1 text-[12px] leading-relaxed">{children}</div>
    </section>
  );
}
