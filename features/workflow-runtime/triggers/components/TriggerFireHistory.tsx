"use client";

/**
 * TriggerFireHistory — proof it actually ran.
 *
 * THE DOOR LAW: every fire that produced a run names that run AND opens it.
 * `/workflows/runs/[runId]` is the run's permalink, so a schedule that fired
 * at 3am is one click from the thing it produced. A fire that FAILED says why
 * in the server's own words — a silent gap in the list would be the worst
 * possible answer to "did my schedule work?".
 */

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, ExternalLink } from "lucide-react";
import Link from "next/link";

import type { TriggerFire } from "../types";
import { formatInZone } from "./RecurrenceEditor";

export function TriggerFireHistory({
  triggerId,
  timezone,
  load,
}: {
  triggerId: string;
  timezone: string;
  load: (triggerId: string) => Promise<TriggerFire[]>;
}) {
  const [fires, setFires] = useState<TriggerFire[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void load(triggerId).then((rows) => {
      if (!cancelled) setFires(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [load, triggerId]);

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
