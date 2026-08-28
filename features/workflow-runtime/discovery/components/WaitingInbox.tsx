"use client";

/**
 * The "waiting on you" inbox — census #38.
 *
 * ONE list of every run holding for a person: `interrupted` (a question asked
 * mid-run) and `awaiting_input` (a start-time park for a missing input). Before
 * this surface existed, the only way to reach such a run was to already be on
 * its page — runs sat parked for days with nothing anywhere saying so.
 *
 * 🚨 **This inbox never answers anything.** A row's action opens the RUN, where
 * the interrupt card and the resumable start form already live. A second answer
 * form here would be a second renderer of the same question (THE ONE-COMPONENT
 * LAW), drifting from the one people actually use.
 */

import Link from "next/link";
import { AlertTriangle, Inbox, MessageCircleQuestion, PenLine } from "lucide-react";

import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { relativeTime } from "@/lib/entity-list/columns";
import { cn } from "@/lib/utils";

import {
  isOverdue,
  waitingAction,
  waitingRunHref,
  waitingSummary,
  type WaitingRunRow,
} from "../waiting";
import { useWaitingRuns } from "../useWaitingRuns";

function WaitingRowCard({ row }: { row: WaitingRunRow }) {
  const summary = waitingSummary(row);
  const overdue = isOverdue(row);
  const href = waitingRunHref(row);
  // A recovered snapshot can be thinner than a fresh one. When it is thin
  // enough that the row cannot say what was asked, it says THAT rather than
  // letting a generic line read as the real question.
  const recoveredThin = row.stale && !row.title && !row.prompt;

  return (
    <li
      data-run-id={row.runId}
      data-waiting-kind={row.kind}
      className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
    >
      {row.kind === "awaiting_input" ? (
        <PenLine className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      ) : (
        <MessageCircleQuestion className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      )}

      <div className="min-w-0 flex-1">
        <Link
          href={href}
          className="block truncate text-sm font-medium text-foreground hover:underline"
          title={row.prompt ?? summary}
        >
          {summary}
        </Link>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {row.definitionId ? (
            <EntityRef
              token="workflow"
              id={row.definitionId}
              name={row.workflowName}
              className="max-w-[16rem] truncate"
            />
          ) : (
            <span className="truncate">{row.workflowName ?? "Workflow"}</span>
          )}
          {row.askedAt && <span>· waiting {relativeTime(row.askedAt).replace(" ago", "")}</span>}
          {row.deadline && (
            <span className={cn(overdue && "font-medium text-destructive")}>
              · {overdue ? "past due" : `due ${relativeTime(row.deadline)}`}
            </span>
          )}
          {row.parentRunId && <span>· part of a larger run</span>}
        </div>

        {recoveredThin && (
          <p className="mt-1 text-xs text-muted-foreground">
            This one parked before we started recording the question — open the run to see it.
          </p>
        )}
      </div>

      <Link
        href={href}
        className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-accent"
      >
        {waitingAction(row)}
      </Link>
    </li>
  );
}

export function WaitingInbox() {
  const { rows, loading, error } = useWaitingRuns();

  if (loading) {
    return (
      <ul className="space-y-2 p-3" aria-busy="true">
        {[0, 1, 2].map((n) => (
          <li key={n} className="h-14 animate-pulse rounded-lg border border-border bg-card" />
        ))}
      </ul>
    );
  }

  // "Nothing is waiting on you" and "we could not check" are opposite answers.
  // Never show the reassuring one for the alarming one.
  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 p-10 text-center" role="alert">
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <p className="text-sm font-medium text-foreground">
          Could not check what is waiting on you
        </p>
        <p className="text-xs text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 p-10 text-center">
        <Inbox className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Nothing is waiting on you</p>
        <p className="text-xs text-muted-foreground">
          Runs that need an answer or a missing input land here.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2 p-3" data-waiting-count={rows.length}>
      {rows.map((row) => (
        <WaitingRowCard key={row.runId} row={row} />
      ))}
    </ul>
  );
}
