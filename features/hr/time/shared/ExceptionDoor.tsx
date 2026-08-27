"use client";

/**
 * features/hr/time/shared/ExceptionDoor.tsx — the ONE way a raised attendance exception becomes a
 * door onto route 31.
 *
 * 🚨 WHY THIS EXISTS. Every surface that told somebody an exception had been raised was rendering
 * `exception.message` as plain text — a sentence where a link belongs. That is the dead end the
 * door law exists to stop, and it is worst precisely here: the person reading *"no meal break was
 * provided on a 9.5-hour shift"* is the person who needs to go and do something about it, and the
 * surface was leaving them to find the queue on their own.
 *
 * 🚨 THE DOOR IS DEEP-LINKED, NOT A LINK TO "THE QUEUE". It carries the employment, the
 * `local_work_date` and the kind, so the reader lands on **that** exception rather than on 400 rows
 * they now have to search. A door that drops you at an unfiltered list is barely better than no
 * door.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 🚨🚨 THE KIOSK MUST NEVER MOUNT THIS, AND NEITHER MUST ANYTHING INSIDE `app/(kiosk)`.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * SPEC-TIME §2.8 and R-L3 L3-65 are explicit: the `(kiosk)` group has *"no route to any other HR
 * surface"*, and SPEC-UI-IA row 36 calls it *"no back door into HR data"*. A wall tablet is a
 * shared, unauthenticated device standing in a break room; a link from it into the exceptions queue
 * is a roster disclosure and an authenticated-surface leak, not a convenience. The kiosk states an
 * exception in words and stops there — that is correct, and it is not a gap to be closed.
 *
 * The clock surfaces (routes 6 and 34) are a different thing entirely: they run inside the app
 * shell, for a signed-in person, and they SHOULD use this.
 */

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { hrTimeExceptionsHref } from "@/features/hr/routes";
import { cn } from "@/lib/utils";

import type { AttendanceExceptionRow } from "../api/types";

/**
 * The deep link onto one exception's row in route 31.
 *
 * Exported on its own so a caller that already owns its markup — the clock lane's status panel and
 * confirmation card — can put the href on whatever element it is already rendering, instead of
 * hand-assembling `/hr/time/exceptions?...` and drifting from the canonical builder.
 */
export function hrExceptionHref(
  exception: Pick<
    AttendanceExceptionRow,
    "employmentId" | "localWorkDate" | "exceptionKind"
  >,
): string {
  return hrTimeExceptionsHref(undefined, {
    employment: exception.employmentId,
    day: exception.localWorkDate,
    kind: exception.exceptionKind,
  });
}

/**
 * A raised exception, rendered as the door it should always have been: **the server's own sentence
 * is the link text**, so nothing is added to the page and nothing is paraphrased.
 *
 * `tone="notice"` is the default — an amber-bordered line for a surface that is telling somebody
 * something was flagged. `tone="bare"` drops the chrome for a host that already provides it.
 */
export function ExceptionSentence({
  exception,
  tone = "notice",
  className,
}: {
  exception: AttendanceExceptionRow;
  tone?: "notice" | "bare";
  className?: string;
}) {
  return (
    <Link
      href={hrExceptionHref(exception)}
      className={cn(
        "group flex items-start gap-1.5 text-xs",
        tone === "notice" &&
          "rounded-md border border-amber-500/40 bg-amber-500/5 px-2.5 py-1.5",
        className,
      )}
    >
      {/* The sentence is the server's, verbatim. The door is the only thing added. */}
      <span className="min-w-0 underline decoration-dotted underline-offset-2 group-hover:decoration-solid">
        {exception.message}
      </span>
      <ArrowUpRight
        className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground"
        aria-hidden
      />
    </Link>
  );
}

/** The same door for a list. Kept here so no surface re-derives the `<ul>` shape around it. */
export function ExceptionSentenceList({
  exceptions,
  tone = "notice",
  className,
}: {
  exceptions: AttendanceExceptionRow[];
  tone?: "notice" | "bare";
  className?: string;
}) {
  if (exceptions.length === 0) return null;
  return (
    <ul className={cn("space-y-1", className)}>
      {exceptions.map((exception) => (
        <li key={exception.id}>
          <ExceptionSentence exception={exception} tone={tone} />
        </li>
      ))}
    </ul>
  );
}
