"use client";

/**
 * ExportPreconditionAlert — §4.4's four named preconditions, each rendered DISTINCTLY, each with
 * the right door.
 *
 * 🚨 WHY FOUR SEPARATE RENDERINGS AND NOT ONE ERROR BOX. Every one of these has a different fix
 * performed by a different person: approve the period · finalise a workweek · get a jurisdiction
 * rule verified · map an employee's external payroll id. A single "Export failed" box is
 * technically true, tells a payroll administrator nothing about what to do next, and is how a pay
 * period sits unexported until someone escalates. T13-2 asks for exactly these four, as four real
 * error bodies.
 *
 * 🚨 THE 422 IS A REFUSAL, AND THE COPY SAYS SO IN WORDS. When an advisory rule touches money the
 * export REFUSES — it does not omit the amount, substitute a zero, or export "what it can". A
 * payroll file with a silently missing premium is worse than no file, because it fails downstream,
 * in someone else's system, after money moved. The user must be able to read that promise off the
 * screen, so it is written on the screen.
 */

import {
  AlertTriangle,
  CalendarClock,
  Scale,
  ShieldAlert,
  UserRoundX,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { classifyPrecondition, type ExportFailure } from "../errors";
import { HrIdentityDoor } from "./HrIdentityDoor";

function FailureFooter({ failure }: { failure: ExportFailure }) {
  return (
    <p className="mt-3 text-xs text-muted-foreground">
      {failure.code}
      {failure.requestId ? ` · request ${failure.requestId}` : null}
    </p>
  );
}

export function ExportPreconditionAlert({
  failure,
  className,
}: {
  failure: ExportFailure;
  className?: string;
}) {
  const precondition = classifyPrecondition(failure);

  if (precondition.kind === "period_not_approved") {
    return (
      <Alert variant="destructive" className={className}>
        <CalendarClock className="h-4 w-4" aria-hidden />
        <AlertTitle>This pay period has not been approved yet</AlertTitle>
        <AlertDescription>
          {/* The server's own sentence, verbatim — never replaced with a generic one. */}
          <p>{failure.userMessage}</p>
          <p className="mt-2">
            The period is currently{" "}
            <span className="font-medium text-foreground">
              {precondition.state}
            </span>
            . A payroll export needs it approved or later, so that what leaves
            here is what a manager signed off on.
          </p>
          <FailureFooter failure={failure} />
        </AlertDescription>
      </Alert>
    );
  }

  if (precondition.kind === "pending_workweeks") {
    return (
      <Alert variant="destructive" className={className}>
        <AlertTriangle className="h-4 w-4" aria-hidden />
        <AlertTitle>
          {precondition.pendingWorkweekIds.length === 1
            ? "One workweek in this period is not final yet"
            : `${precondition.pendingWorkweekIds.length} workweeks in this period are not final yet`}
        </AlertTitle>
        <AlertDescription>
          <p>{failure.userMessage}</p>
          <p className="mt-2">
            Overtime is computed across a whole workweek, so an unfinalised week
            would export hours that can still change. Finish these, then export:
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {precondition.pendingWorkweekIds.map((workweekId) => (
              <li key={workweekId}>
                <HrIdentityDoor kind="workweek" id={workweekId} />
              </li>
            ))}
          </ul>
          <FailureFooter failure={failure} />
        </AlertDescription>
      </Alert>
    );
  }

  if (precondition.kind === "advisory_rule_blocks_money") {
    return (
      <Alert variant="destructive" className={className}>
        <Scale className="h-4 w-4" aria-hidden />
        <AlertTitle>
          This export was refused — a pay rule is still awaiting verification
        </AlertTitle>
        <AlertDescription>
          <p>{failure.userMessage}</p>
          <p className="mt-2 font-medium text-foreground">
            No file was produced, and no amount was substituted or left out. A
            rule that decides money has to be verified before we will put a
            number on a payroll file — a file with a silently missing premium is
            worse than no file at all, because it fails in someone else&apos;s
            system after the money has moved.
          </p>
          <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
            {precondition.ruleClass ? (
              <>
                <dt className="text-muted-foreground">Rule class</dt>
                <dd className="font-medium text-foreground">
                  {precondition.ruleClass}
                </dd>
              </>
            ) : null}
            {precondition.jurisdictionKey ? (
              <>
                <dt className="text-muted-foreground">Jurisdiction</dt>
                <dd className="font-medium text-foreground">
                  {precondition.jurisdictionKey}
                </dd>
              </>
            ) : null}
            {precondition.ruleId ? (
              <>
                <dt className="text-muted-foreground">Rule</dt>
                <dd className="font-mono text-foreground">
                  {precondition.ruleId}
                </dd>
              </>
            ) : null}
          </dl>
          {precondition.affectedEmploymentIds.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs text-muted-foreground">
                People affected by this rule:
              </p>
              <ul className="mt-1 flex flex-wrap gap-2">
                {precondition.affectedEmploymentIds.map((employmentId) => (
                  <li key={employmentId}>
                    <HrIdentityDoor kind="employment" id={employmentId} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <FailureFooter failure={failure} />
        </AlertDescription>
      </Alert>
    );
  }

  if (precondition.kind === "unmapped_identifiers") {
    return (
      <Alert variant="destructive" className={className}>
        <UserRoundX className="h-4 w-4" aria-hidden />
        <AlertTitle>
          {precondition.unmapped.length === 1
            ? "One person still needs an ID for this payroll system"
            : `${precondition.unmapped.length} people still need IDs for this payroll system`}
        </AlertTitle>
        <AlertDescription>
          <p>{failure.userMessage}</p>
          <p className="mt-2">
            The receiving system does not know our employee numbers, so we
            refuse rather than send a file with blanks in the ID column. Map
            each of these, then export:
          </p>
          <ul className="mt-2 space-y-1">
            {precondition.unmapped.map((entry) => (
              <li
                key={`${entry.employment_id}:${entry.field}`}
                className="flex flex-wrap items-center gap-2 text-xs"
              >
                <HrIdentityDoor kind="employment" id={entry.employment_id} />
                <span className="text-muted-foreground">missing</span>
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                  {entry.field}
                </span>
              </li>
            ))}
          </ul>
          <FailureFooter failure={failure} />
        </AlertDescription>
      </Alert>
    );
  }

  // Not one of the four. Show the server's own sentence and NEVER dress it up as one of them —
  // sending someone to fix the wrong thing costs more than saying "we don't recognise this".
  return (
    <Alert variant="destructive" className={className}>
      <ShieldAlert className="h-4 w-4" aria-hidden />
      <AlertTitle>This export could not be built</AlertTitle>
      <AlertDescription>
        <p>{failure.userMessage}</p>
        {failure.retryable ? (
          <p className="mt-2">
            This one is temporary — try again in a few minutes.
          </p>
        ) : null}
        <FailureFooter failure={failure} />
      </AlertDescription>
    </Alert>
  );
}
