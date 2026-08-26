"use client";

/**
 * features/hr/time/shared/ExceptionsStrip.tsx — L3-58 / SPEC-TIME §5.4.
 *
 * A persistent strip above the grid on routes 28 and 29: open exceptions in the visible scope,
 * grouped by kind with counts, ordered by **severity then age**, each group a door to route 31
 * pre-filtered, each row resolvable inline without leaving the timesheet.
 *
 * 🚨 THE EMPTY STATE IS A SENTENCE: *"No open exceptions in this period."* §5.4 states the reason
 * in one line — **an absent strip and a clean period must not look identical.** A component that
 * returns `null` when the list is empty is indistinguishable from a component nobody mounted, and
 * the manager cannot tell "nothing is wrong" from "nothing was checked".
 *
 * 🚨 THE ACTIONS COME FROM THE ROW'S OWN `allowedResolutions`, NEVER A HARDCODED LIST (§2.6).
 * `excused` is absent on `severity='violation'` because a statutory-premium exception cannot be
 * excused into nonexistence and an org cannot configure that away. The server refuses it too — the
 * control's absence is courtesy, the refusal is the contract.
 */

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { hrTimeExceptionsHref } from "@/features/hr/routes";
import type { HrFixtureCase } from "@/features/hr/mock/transport";

import { resolveAttendanceException } from "../api/service";
import type {
  AttendanceExceptionKind,
  AttendanceExceptionRow,
  ExceptionResolutionState,
} from "../api/types";
import { SeverityChip } from "./badges";
import { formatLocalDate, pluralize } from "./format";
import { RefusalNotice } from "./RefusalNotice";
import {
  EXCEPTION_KIND_LABELS,
  RESOLUTIONS_REQUIRING_NOTE,
  RESOLUTION_LABELS,
  SEVERITY_RANK,
} from "./vocabulary";

const MIN_NOTE_LENGTH = 2;

interface KindGroup {
  kind: AttendanceExceptionKind;
  rows: AttendanceExceptionRow[];
  rank: number;
  oldest: string;
}

/**
 * Severity then age, exactly as §5.4 orders it. This is sorting rows by two fields — it computes no
 * hours, no money and no duration; `detectedAt` is compared as a string because ISO-8601 sorts
 * lexicographically, which avoids date arithmetic entirely.
 */
function groupByKind(rows: AttendanceExceptionRow[]): KindGroup[] {
  const groups = new Map<AttendanceExceptionKind, AttendanceExceptionRow[]>();
  for (const row of rows) {
    const existing = groups.get(row.exceptionKind);
    if (existing) existing.push(row);
    else groups.set(row.exceptionKind, [row]);
  }

  return Array.from(groups.entries())
    .map(([kind, groupRows]) => {
      const sorted = [...groupRows].sort((a, b) => a.detectedAt.localeCompare(b.detectedAt));
      return {
        kind,
        rows: sorted,
        rank: Math.max(...sorted.map((r) => SEVERITY_RANK[r.severity])),
        oldest: sorted[0]?.detectedAt ?? "",
      };
    })
    .sort((a, b) => (b.rank - a.rank) || a.oldest.localeCompare(b.oldest));
}

export function ExceptionsStrip({
  exceptions,
  /** Pre-filters the route 31 door — a group's door lands on ITS kind, not the whole queue. */
  queueHref = hrTimeExceptionsHref(),
  mockCase,
  onResolved,
  className,
}: {
  exceptions: AttendanceExceptionRow[];
  queueHref?: string;
  mockCase?: HrFixtureCase;
  onResolved: () => void;
  className?: string;
}) {
  const open = exceptions.filter((exc) => exc.resolutionState === "open");
  const groups = groupByKind(open);

  return (
    <section
      className={cn("rounded-lg border border-border bg-card p-3", className)}
      aria-label="Open attendance exceptions"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold">Open exceptions</h2>
        <Link
          href={queueHref}
          className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-4"
        >
          Open the full queue
          <ExternalLink className="h-3 w-3" aria-hidden />
        </Link>
      </header>

      {groups.length === 0 ? (
        /* THE SENTENCE. Not a null, not an empty div. */
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
          No open exceptions in this period.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {groups.map((group) => (
            <KindGroupBlock
              key={group.kind}
              group={group}
              queueHref={queueHref}
              mockCase={mockCase}
              onResolved={onResolved}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function KindGroupBlock({
  group,
  queueHref,
  mockCase,
  onResolved,
}: {
  group: KindGroup;
  queueHref: string;
  mockCase?: HrFixtureCase;
  onResolved: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="rounded-md border border-border bg-muted/30">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2.5 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="text-left text-sm font-medium underline decoration-dotted underline-offset-4"
        >
          {EXCEPTION_KIND_LABELS[group.kind]} · {pluralize(group.rows.length, "person", "people")}
        </button>
        <div className="flex items-center gap-2">
          <SeverityChip
            severity={
              group.rank === 3 ? "violation" : group.rank === 2 ? "warn" : "info"
            }
          />
          {/* THE GROUP'S OWN DOOR, pre-filtered to this kind. */}
          <Link
            href={hrTimeExceptionsHref(undefined, { kind: group.kind })}
            className="text-xs underline underline-offset-4"
          >
            See all
          </Link>
        </div>
      </div>

      {expanded ? (
        <ul className="space-y-1.5 border-t border-border px-2.5 py-2">
          {group.rows.map((row) => (
            <InlineExceptionRow
              key={row.id}
              exception={row}
              mockCase={mockCase}
              onResolved={onResolved}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function InlineExceptionRow({
  exception,
  mockCase,
  onResolved,
}: {
  exception: AttendanceExceptionRow;
  mockCase?: HrFixtureCase;
  onResolved: () => void;
}) {
  return (
    <li className="rounded border border-border bg-card px-2.5 py-2 text-xs">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium">{exception.employeeDisplayName ?? "This employee"}</span>
        <span className="text-muted-foreground">
          {formatLocalDate(exception.localWorkDate, { weekday: true })}
        </span>
      </div>
      {/* The server's sentence, not a token. */}
      <p className="mt-1">{exception.message}</p>
      <ExceptionResolveControls
        exception={exception}
        mockCase={mockCase}
        onResolved={onResolved}
        className="mt-2"
      />
    </li>
  );
}

/**
 * The resolution control set for ONE exception.
 *
 * Everything about which buttons exist comes from `exception.allowedResolutions`. There is no
 * fallback list and no `?? DEFAULT_RESOLUTIONS` — a fallback is exactly how `excused` would
 * reappear on a statutory violation the first time the server sent an unexpected payload.
 */
export function ExceptionResolveControls({
  exception,
  mockCase,
  onResolved,
  className,
}: {
  exception: AttendanceExceptionRow;
  mockCase?: HrFixtureCase;
  onResolved: () => void;
  className?: string;
}) {
  const [pending, setPending] = useState<ExceptionResolutionState | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // `open` is the current state, not an action anyone takes from here.
  const actions = exception.allowedResolutions.filter((state) => state !== "open");

  async function commit(state: ExceptionResolutionState, withNote: string | null) {
    setBusy(true);
    setError(null);
    try {
      await resolveAttendanceException(
        exception.id,
        state,
        withNote,
        exception.premiumEarningCodeId,
        { mockCase },
      );
      toast.success(`Marked as ${RESOLUTION_LABELS[state].toLowerCase()}.`);
      setPending(null);
      setNote("");
      onResolved();
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(String(caught)));
    } finally {
      setBusy(false);
    }
  }

  function start(state: ExceptionResolutionState) {
    if (RESOLUTIONS_REQUIRING_NOTE.has(state)) {
      setPending(state);
      return;
    }
    void commit(state, null);
  }

  return (
    <div className={cn("space-y-2", className)}>
      <RefusalNotice error={error} />

      {exception.isEstimate ? (
        <p className="text-[11px] text-muted-foreground">
          This is based on an estimate. Confirming it keeps it marked as an estimate — it never
          becomes a measurement.
        </p>
      ) : null}

      {exception.workedAfterDenial ? (
        <p className="rounded border border-amber-500/40 bg-amber-500/5 px-2 py-1 text-[11px]">
          This overtime was worked after a request for it was denied. The hours are still paid.
        </p>
      ) : null}

      {pending ? (
        <div className="space-y-2">
          <label
            htmlFor={`exc-note-${exception.id}`}
            className="block text-[11px] font-medium"
          >
            Why is this being {RESOLUTION_LABELS[pending].toLowerCase()}d? A note is required.
          </label>
          <Textarea
            id={`exc-note-${exception.id}`}
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="text-sm"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy || note.trim().length < MIN_NOTE_LENGTH}
              onClick={() => void commit(pending, note.trim())}
            >
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setPending(null);
                setNote("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {actions.map((state) => (
            <Button
              key={state}
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => start(state)}
            >
              {RESOLUTION_LABELS[state]}
            </Button>
          ))}
          {actions.length === 0 ? (
            <span className="text-[11px] text-muted-foreground">
              This exception cannot be resolved from here.
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
