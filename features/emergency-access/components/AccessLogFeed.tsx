// features/emergency-access/components/AccessLogFeed.tsx
//
// THE SUBJECT'S OWN RECORD — "every time anyone opened my data".
//
// A Server Component end to end: the rows are fetched on the server and arrive
// as HTML, so the page paints complete and nothing shifts. There is nothing
// interactive on it by design — this is a record the person reads, not a
// console they operate.
//
// 🚨 REFUSALS ARE THE POINT OF THE PAGE. Somebody trying to open your data and
// being turned away is exactly the thing you would want to know about, so a
// refused attempt gets its own visual treatment and sits in the same list as
// the grants — never hidden, never collapsed into a number.
//
// 🚨 A ROW IS NEVER DROPPED FOR A NAME THAT WOULD NOT RESOLVE. `iam.my_access_log`
// resolves the actor inside the definer function (it can see `auth.users`; the
// browser cannot), but the join is a LEFT join and a deleted account leaves it
// null. The row still renders, carrying the raw actor id — a true, reportable
// fact — because a page that exists to hide nothing cannot start hiding rows.

import {
  Clock,
  DoorOpen,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { createClient } from "@/utils/supabase/server";
import type { AccessLogEntry } from "../types";
import { fetchMyAccessLog } from "../service";
import {
  accessLogBadge,
  accessLogOutcome,
  accessLogVerb,
  authorisedByLabel,
  keyHolderLabel,
  keyWindowLabel,
  purposeLabel,
  recordKindLabel,
  whenLabel,
} from "../presentation";

/** One page of history. Deeper history is a later pagination control, never a
 *  cap somebody silently hits — the footer says plainly when more exists. */
const PAGE_SIZE = 100;

// 🚨 WHO OPENED IT IS `keyHolderLabel`, NOT THE ACTOR. This file used to read
// `entry.actorLabel`, which on the two-person path is the APPROVER — so the one
// page that exists to tell a person who read their data named the person who
// merely authorised it (V-38, 2026-09-12). Both are now shown, each as what it
// is, and the model lives in `../presentation` so no future renderer can pick
// the wrong one on its own.

export async function AccessLogFeed() {
  const client = await createClient();
  const result = await fetchMyAccessLog(client, {
    limit: PAGE_SIZE,
    offset: 0,
  });

  if (!result.ok) {
    // The failure announces itself with the remedy. It never renders as an
    // empty list, which would read as "nobody has ever opened your data".
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-destructive">
          <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          Your access history could not be loaded
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {result.message} This page is not showing an empty history — it is
          showing nothing at all. Reload the page, and if it keeps happening
          tell us, because this record is not optional.
        </p>
      </div>
    );
  }

  const entries = result.data;
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ShieldCheck
            className="h-4 w-4 shrink-0 text-success"
            aria-hidden="true"
          />
          Nobody has ever opened your data
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          No one has used the emergency door on a record of yours, and no one
          has been turned away trying. If that ever changes you will be told at
          the moment it happens, and it will appear here permanently.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {entries.map((entry) => (
          <li key={entry.id}>
            <AccessLogRow entry={entry} />
          </li>
        ))}
      </ul>
      {entries.length === PAGE_SIZE ? (
        <p className="text-xs text-muted-foreground">
          Showing the {PAGE_SIZE} most recent entries. Older entries are kept
          and are not shown on this page yet.
        </p>
      ) : null}
    </div>
  );
}

function AccessLogRow({ entry }: { entry: AccessLogEntry }) {
  // THE ACTION IS THE AUTHORITY. `!entry.granted` used to decide this, which
  // painted every pending ask — the common case on the two-person path — as a
  // red REFUSED card with the stand-in reason "No reason recorded".
  const outcome = accessLogOutcome(entry);
  const refused = outcome === "refused";
  const opened = outcome === "granted";
  const holder = keyHolderLabel(entry);
  const authoriser = authorisedByLabel(entry);

  const tone = refused
    ? "rounded-lg border border-destructive/50 bg-destructive/5 p-4"
    : opened
      ? "rounded-lg border border-border bg-card p-4"
      : "rounded-lg border border-border bg-muted/30 p-4";

  const badgeTone = refused
    ? "inline-flex items-center gap-1.5 rounded-md bg-destructive px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-destructive-foreground"
    : opened
      ? "inline-flex items-center gap-1.5 rounded-md bg-success px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-success-foreground"
      : "inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground";

  return (
    <article className={tone}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={badgeTone}>
          {refused ? (
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
          ) : opened ? (
            <DoorOpen className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {accessLogBadge(outcome)}
        </span>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {whenLabel(entry.occurredAt)}
        </span>
        {entry.isEmergencyDoor ? (
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Emergency door
          </span>
        ) : null}
        {entry.organizationLabel ? (
          <span className="text-xs text-muted-foreground">
            {entry.organizationLabel}
          </span>
        ) : null}
      </header>

      <p className="mt-2 flex items-start gap-1.5 text-sm text-foreground">
        <UserRound
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <span>
          <span className="font-medium break-all">{holder}</span>{" "}
          {accessLogVerb(outcome)}{" "}
          <span className="font-medium">
            {recordKindLabel(entry.targetToken)}
          </span>
          {entry.targetIds.length > 1
            ? ` — ${entry.targetIds.length} records`
            : ""}
          .
        </span>
      </p>

      {/* The second person, named as what they are. Absent when there is only
          one person in the act, so a `confidential` open does not read as if
          somebody approved it. */}
      {authoriser ? (
        <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
          <UserRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {opened ? "Approved by" : "Answered by"}{" "}
            <span className="font-medium break-all">{authoriser}</span>.
          </span>
        </p>
      ) : null}

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            Reason they picked
          </dt>
          <dd className="text-foreground">{purposeLabel(entry.purpose)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            {refused
              ? "Why it was refused"
              : opened
                ? "How long the key lasts"
                : "What happened next"}
          </dt>
          <dd className="flex items-center gap-1.5 text-foreground">
            {opened ? (
              <KeyRound
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            ) : null}
            {/* 🚨 NEVER purposeLabel(denialReason) ON A ROW THAT WAS NOT
                REFUSED — on a pending ask that renders "No reason recorded",
                an invented reason for a refusal that never happened. */}
            {refused
              ? entry.denialReason?.trim() ||
                "The reason was not recorded — tell us if you see this."
              : opened
                ? keyWindowLabel(entry.grantExpiresAt)
                : outcome === "lapsed"
                  ? "Nobody answered it and it lapsed. Nothing was opened."
                  : "An owner of the organization has to approve it before anything opens."}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            The sentence they typed
          </dt>
          <dd className="mt-1 border-l-2 border-border pl-3 text-sm italic text-foreground">
            {entry.justification?.trim() || "They typed nothing."}
          </dd>
        </div>
      </dl>
    </article>
  );
}

/** Dimension-matched fallback — same border, padding and row rhythm as a real
 *  row, so streaming the list in shifts nothing. */
export function AccessLogFeedSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <div key={row} className="rounded-lg border border-border bg-card p-4">
          <div className="flex gap-3">
            <div className="h-5 w-20 animate-pulse rounded-md bg-muted" />
            <div className="h-5 w-40 animate-pulse rounded-md bg-muted" />
          </div>
          <div className="mt-2 h-5 w-3/4 animate-pulse rounded-md bg-muted" />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="h-9 animate-pulse rounded-md bg-muted" />
            <div className="h-9 animate-pulse rounded-md bg-muted" />
          </div>
          <div className="mt-3 h-14 animate-pulse rounded-md bg-muted" />
        </div>
      ))}
    </div>
  );
}
