"use client";

// lib/progress/WorkingNotice.tsx
//
// THE ONE WAITING LINE. A surface that is making a person wait on AI says three
// things and no more: what is happening (the server's own sentence, never one
// the screen invented), how long it has been, and how long this kind of work
// usually takes. The clock moves every second, which is the whole point — cold
// walk 6, finding 6 (2026-09-17) measured 61 unbroken seconds of one identical
// motionless label on the Bad Example Probe and 18 on the Triad's deal, and a
// motionless label is read as "stuck" by the person we built this for.
//
// WHAT IT REFUSES TO DO
//
// * No percentage, no bar, no fraction. Nothing on this path knows one, and a
//   fabricated progress bar is a lie told slowly.
// * No sentence of its own about the work. `doing` comes from the server (or,
//   for a lane with no stream, from the surface's own honest copy) and is
//   rendered as written.
// * No promise it has already outlived — past the grace band the second line
//   stops promising and reports (`lib/progress/elapsed.ts`).
//
// It is deliberately NOT tied to `useDurableRun`: the Triad's deal is a plain
// in-tab await with no durable row, and it owes the reader exactly the same
// three things as a durable probe round does.

import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { elapsedDetail, useElapsedSince } from "./elapsed";

export function WorkingNotice({
  doing,
  startedAt,
  usualMs,
  keepsGoingWithoutYou = false,
  action,
  className,
}: {
  /** What is happening, in the words of whoever actually knows — usually the
   *  server's own stage sentence. Rendered verbatim. */
  doing: string;
  /** When this wait began, epoch ms. Null renders nothing at all. */
  startedAt: number | null;
  /** How long this kind of work usually takes — measured, never guessed. */
  usualMs: number;
  /** True when the work survives the person closing the page. */
  keepsGoingWithoutYou?: boolean;
  /** A Stop control, when the work can really be stopped. */
  action?: ReactNode;
  className?: string;
}) {
  const elapsedMs = useElapsedSince(startedAt);
  if (startedAt === null) return null;
  const detail = elapsedDetail({ elapsedMs, usualMs, keepsGoingWithoutYou });
  return (
    <div
      // A live region, because the sentence under it changes while the person
      // is reading something else on the page.
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground",
        className,
      )}
    >
      <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
      <div className="min-w-0 flex-1">
        <p className="text-foreground">{doing}</p>
        {detail ? (
          <p className="mt-0.5 text-xs tabular-nums">{detail}</p>
        ) : null}
      </div>
      {action ? <div className="ml-auto shrink-0">{action}</div> : null}
    </div>
  );
}
