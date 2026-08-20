"use client";

/**
 * TriggerFireHistory — proof it actually ran.
 *
 * THE DOOR LAW: every fire that produced a run names that run AND opens it.
 * `/workflows/runs/[runId]` is the run's permalink, so a schedule that fired
 * at 3am is one click from the thing it produced. A fire that FAILED says why
 * in the server's own words — a silent gap in the list would be the worst
 * possible answer to "did my schedule work?".
 *
 * And "we couldn't read the log" is NEVER rendered as "it hasn't run yet".
 * Those are opposite answers, and printing the reassuring one for the failure
 * is how a person concludes their schedule is broken when it is not. It is a
 * real state here, with the last run still offered as a door (the trigger row
 * itself knows that id, independently of this audit read).
 */

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, ExternalLink } from "lucide-react";
import Link from "next/link";

import type { TriggerFire } from "../types";
import { formatInZone } from "./RecurrenceEditor";

export function TriggerFireHistory({
  triggerId,
  timezone,
  lastRunId,
  load,
}: {
  triggerId: string;
  timezone: string;
  /** Known from the trigger row itself, so the door survives a failed read. */
  lastRunId: string | null;
  load: (triggerId: string) => Promise<TriggerFire[] | null>;
}) {
  const [fires, setFires] = useState<TriggerFire[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void load(triggerId).then((rows) => {
      if (cancelled) return;
      if (rows === null) {
        setFailed(true);
        return;
      }
      setFires(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [load, triggerId]);

  if (failed) {
    return (
      <div className="space-y-1.5">
        <p className="flex items-start gap-1.5 text-[11px] text-destructive">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          We couldn&apos;t read this one&apos;s history just now. That says
          nothing about whether it ran — try again in a moment.
        </p>
        {lastRunId ? (
          <Link
            href={`/workflows/runs/${lastRunId}`}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
          >
            Open the last run
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
    );
  }

  if (fires === null) {
    return (
      <div className="space-y-1.5" aria-label="Loading recent runs">
        <div className="h-6 animate-pulse rounded bg-muted/60" />
        <div className="h-6 animate-pulse rounded bg-muted/40" />
      </div>
    );
  }

  if (fires.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        It hasn&apos;t run yet. Once it does, every run shows up here.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border/60">
      {fires.map((fire) => (
        <li
          key={fire.id}
          className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5"
        >
          <span className="text-[11px] text-muted-foreground">
            {formatInZone(fire.firedAt, timezone)}
          </span>
          {fire.status === "failed" ? (
            <span className="flex items-center gap-1 text-[11px] text-destructive">
              <AlertTriangle className="h-3 w-3" />
              Didn&apos;t start
              {fire.errorMessage ? `: ${fire.errorMessage}` : ""}
            </span>
          ) : fire.runId ? (
            <>
              <Link
                href={`/workflows/runs/${fire.runId}`}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                Open this run
                <ArrowUpRight className="h-3 w-3" />
              </Link>
              <a
                href={`/workflows/runs/${fire.runId}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Open this run in a new tab"
                className="inline-flex items-center text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              Started, but no run was recorded.
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
