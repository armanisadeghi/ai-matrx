/**
 * features/hr/leave/components/LeaveLedgerView.tsx — SPEC-LEAVE §12.
 *
 * *"Make every balance defensible. This is the screen that answers a wage claim, a payroll
 * dispute, and 'where did my four hours go?' — and it is the reason the ledger is
 * append-only."*
 *
 * 🚨 ONE COMPONENT, TWO ROUTES. `/hr/me/time-off/[policyId]` renders this with
 * `viewer="self"`; `/hr/leave/balances/[employmentId]/[policyId]` renders THE SAME component
 * with `viewer="delegated"`. The doors out differ per viewer, so they are passed in as
 * builders rather than assembled here — that is the whole reason this file has no
 * `useHrContext` and no route knowledge.
 *
 * 🚨 NO EDIT AND NO DELETE ANYWHERE ON THIS SCREEN, FOR ANYONE. The ledger is append-only;
 * the only write reachable from a balance is *Adjust balance* (§6, `hr_admin`), which lives
 * on the admin surface and appends. Nothing here mutates anything.
 *
 * 🚨 NO CELL PRINTS A TYPE NAME (§12 LAW 3a). `entry_kind` arrives on every row and is used
 * ONLY to filter. The visible cell is the server's `sentence`.
 */

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  FileSearch,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import type { LeaveLedgerEntry, LeaveLedgerView as LeaveLedger } from "../api/types";
import { LeaveBalanceBlock, formatHours } from "./LeaveBalanceBlock";

/**
 * The filters a figure's door can ask for. §5: *"Every figure is a door to the ledger rows
 * that produced it."*
 *
 * 🚨 `used_taken` AND `approved_upcoming` FILTER ON THE SERVER'S OWN `counts_toward` MARK,
 * AND THE CLIENT DOES NOT RE-DERIVE THE SPLIT. `hr.leave_ledger_view` computes
 * `counts_toward` per entry; reproducing that predicate here from `request_state` +
 * `request_ends_on` would be a second implementation of the split, and the two would drift the
 * first time either side changed.
 *
 * THE MARK AND THE FIGURE DESCRIBE THE SAME SET, and that took a fix to be true.
 * Measured 2026-08-27 against both live bodies, they disagreed on one branch: an **approved
 * request whose end date had passed and which was not yet marked `taken`** was in NEITHER
 * figure, while the ledger view marked it `counts_toward = 'used_taken'` — so this door showed
 * a row the "Used (taken)" NUMBER did not contain. Reported rather than patched here, because
 * a client that quietly hid the row would have made the disagreement invisible on the one
 * screen built to expose disagreements, and re-deriving the predicate would only have
 * relocated the drift.
 *
 * The lane ruled for the identity (`hr_l5_12`, verified live): the `usage` entry is written at
 * APPROVAL (§1.2 encumbrance), so those hours have already left the balance — counting them
 * nowhere broke §5's identity and fired the divergence banner at employees, correctly and
 * uselessly, while calling them "upcoming" would be a lie about a week that is over.
 * `hr.leave_figures.used_taken` is now
 * `state in ('taken','partially_taken') OR (state = 'approved' AND ends_on < current_date)`,
 * exhaustive with `approved_upcoming` over every approved request. The migration's self-proof
 * re-reads BOTH `prosrc`s and fails if either side is edited alone, so the two cannot silently
 * part again. (An amendment to SPEC-LEAVE §5's "Used (taken)" wording is owed by that lane.)
 */
export type LeaveLedgerFilter = "all" | "added" | "used_taken" | "approved_upcoming";

const ADDED_KINDS: ReadonlySet<string> = new Set([
  "accrual",
  "carryover",
  "opening_balance",
  "reinstatement",
]);

const FILTER_LABEL: Record<LeaveLedgerFilter, string> = {
  all: "Every entry",
  added: "Time added",
  used_taken: "Time taken",
  approved_upcoming: "Approved, not yet taken",
};

/** What the chip tells the reader was actually applied — never a vaguer claim than the truth. */
const FILTER_EXPLANATION: Record<LeaveLedgerFilter, string> = {
  all: "Showing every entry on this policy.",
  added:
    "Showing accruals, carry-overs, opening balances, reinstatements and additions made by hand — the entries behind “Accrued to date”.",
  used_taken:
    "Showing the entries behind “Used (taken)” — time already taken, plus approved time whose last day has passed, and any time returned against them.",
  approved_upcoming:
    "Showing the entries behind “Approved upcoming” — approved time whose last day is still ahead, and any time returned against it.",
};

function matchesFilter(entry: LeaveLedgerEntry, filter: LeaveLedgerFilter): boolean {
  if (filter === "all") return true;
  if (filter === "added") {
    const kind = entry.entryKind;
    if (kind === null) return false;
    if (ADDED_KINDS.has(kind)) return true;
    return kind === "adjustment" && entry.hoursDelta !== null && entry.hoursDelta > 0;
  }
  return entry.countsToward === filter;
}

function signedHours(value: number | null): string | null {
  const shown = formatHours(value);
  if (shown === null || value === null) return shown;
  return value > 0 ? `+${shown}` : shown;
}

/** `automation`/`engine` are systems, not people — say so instead of leaving the cell blank. */
function actorLabel(entry: LeaveLedgerEntry): string | null {
  if (entry.actorName) return entry.actorName;
  if (entry.actorType === null) return null;
  if (entry.actorType === "automation" || entry.actorType === "system") {
    return entry.engineKey
      ? `Automation · ${entry.engineKey}${entry.engineVersion ? ` v${entry.engineVersion}` : ""}`
      : "Automation";
  }
  return entry.actorType;
}

export interface LeaveLedgerViewProps {
  ledger: LeaveLedger;
  policyName: string | null;
  /** `self` on `/hr/me/time-off/[policyId]`, `delegated` on the manager/HR route. */
  viewer: "self" | "delegated";
  filter?: LeaveLedgerFilter;
  onFilterChange?: (filter: LeaveLedgerFilter) => void;
  /** The as-of the ledger was read at, and the setter that re-reads it SERVER-SIDE. */
  asOf: string | null;
  onAsOfChange?: (asOf: string | null) => void;
  /** Door builders, supplied by the host route so this component knows no URLs. */
  requestHref?: (leaveRequestId: string) => string | null;
  workweekHref?: (workweekId: string) => string | null;
  className?: string;
}

export function LeaveLedgerView({
  ledger,
  policyName,
  viewer,
  filter = "all",
  onFilterChange,
  asOf,
  onAsOfChange,
  requestHref,
  workweekHref,
  className,
}: LeaveLedgerViewProps) {
  const [snapshotEntry, setSnapshotEntry] = useState<LeaveLedgerEntry | null>(null);

  /**
   * Newest first. `hr.leave_ledger_view` returns oldest-first because `running_sum` is
   * accumulated in that order and reversing it server-side would break the running total it
   * computes; §12 asks for newest-first on screen, so the REVERSAL IS A PRESENTATION CHOICE
   * over rows whose numbers were all computed by the server.
   */
  const rows = useMemo(
    () => ledger.entries.filter((e) => matchesFilter(e, filter)).slice().reverse(),
    [ledger.entries, filter],
  );

  const reversedIds = useMemo(
    () =>
      new Set(
        ledger.entries
          .map((e) => e.reversesEntryId)
          .filter((id): id is string => typeof id === "string"),
      ),
    [ledger.entries],
  );

  const reversalByTarget = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of ledger.entries) {
      if (e.reversesEntryId) map.set(e.reversesEntryId, e.id);
    }
    return map;
  }, [ledger.entries]);

  const divergent = ledger.runningBalanceOk === false;

  return (
    <div className={cn("flex min-w-0 flex-col gap-4", className)}>
      {/*
        🚨 THE BLOCKING BANNER. The server recomputes Σ hours_delta and compares it to the
        last balance_after; a mismatch names the FIRST divergent row. "A silent drift is worse
        than a loud one" — so this sits above the figures, not beside them.
      */}
      {divergent ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border-2 border-destructive bg-destructive/10 p-3"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-destructive">
              This ledger does not add up, and these figures cannot be relied on.
            </p>
            <p className="mt-0.5 text-destructive/90">
              The running total of every change disagrees with the recorded balance. The first
              row where they part company is marked below.
            </p>
            {/*
              The id is NOT printed. A bare uuid on screen is a dead end with extra steps —
              the row itself is the identity, so the banner opens it.
            */}
            {ledger.divergenceAtEntryId ? (
              <a
                href={`#ledger-entry-${ledger.divergenceAtEntryId}`}
                className="mt-1.5 inline-block text-sm font-medium text-destructive underline underline-offset-2"
              >
                Go to the first entry where they part company
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {ledger.unexplainedEntryCount !== null && ledger.unexplainedEntryCount > 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/60 bg-destructive/5 p-3 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <p className="text-destructive/90">
            {ledger.unexplainedEntryCount === 1
              ? "One entry on this policy has no calculation behind it."
              : `${ledger.unexplainedEntryCount} entries on this policy have no calculation behind them.`}{" "}
            Every rule-driven entry is supposed to carry the snapshot that produced it. These
            are marked in the table.
          </p>
        </div>
      ) : null}

      <LeaveBalanceBlock
        figures={ledger.figures}
        sentence={ledger.sentence}
        ledgerHref={null}
        title={policyName}
        asOfLabel={asOf ? `As of ${asOf}` : null}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(Object.keys(FILTER_LABEL) as LeaveLedgerFilter[]).map((key) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={filter === key ? "default" : "outline"}
              onClick={() => onFilterChange?.(key)}
            >
              {FILTER_LABEL[key]}
            </Button>
          ))}
        </div>

        {/*
          §12: an as-of picker "truncates the view and recomputes §5's five figures for that
          date — the same projector, no second implementation." So it re-reads the RPC; the
          client recomputes nothing.
        */}
        {onAsOfChange ? (
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="leave-ledger-as-of" className="text-xs">
                As of
              </Label>
              <Input
                id="leave-ledger-as-of"
                type="date"
                value={asOf ?? ""}
                onChange={(e) => onAsOfChange(e.target.value || null)}
                className="h-9 w-40"
              />
            </div>
            {asOf ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onAsOfChange(null)}
              >
                Today
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">{FILTER_EXPLANATION[filter]}</p>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[52rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              <th className="px-3 py-2 font-medium text-muted-foreground">Date</th>
              <th className="px-3 py-2 font-medium text-muted-foreground">What happened</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Change</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                Balance after
              </th>
              <th className="px-3 py-2 font-medium text-muted-foreground">Source</th>
              <th className="px-3 py-2 font-medium text-muted-foreground">Rule</th>
              <th className="px-3 py-2 font-medium text-muted-foreground">By</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  {ledger.entryCount === 0
                    ? "Nothing has been added to or taken from this policy yet."
                    : "No entries match this filter."}
                </td>
              </tr>
            ) : null}

            {rows.map((entry) => {
              const isReversed = reversedIds.has(entry.id);
              const reversalId = reversalByTarget.get(entry.id) ?? null;
              const isDivergent = ledger.divergenceAtEntryId === entry.id;
              const delta = signedHours(entry.hoursDelta);
              const after = formatHours(entry.balanceAfter);
              const by = actorLabel(entry);

              return (
                <tr
                  key={entry.id}
                  id={`ledger-entry-${entry.id}`}
                  className={cn(
                    "border-b border-border last:border-b-0 align-top",
                    isDivergent ? "bg-destructive/10" : null,
                  )}
                >
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                    {entry.occurredOn ?? "—"}
                  </td>

                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "text-foreground",
                        /* Reversal pairing: struck through, never removed. Neither disappears. */
                        isReversed ? "line-through decoration-muted-foreground/60" : null,
                      )}
                    >
                      {entry.sentence ?? "This entry carries no description."}
                    </span>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {entry.unexplained ? (
                        <Badge variant="destructive" className="gap-1">
                          <ShieldAlert className="h-3 w-3" aria-hidden />
                          Unexplained entry
                        </Badge>
                      ) : null}
                      {isDivergent ? (
                        <Badge variant="destructive">Balance parts company here</Badge>
                      ) : null}
                      {isReversed && reversalId ? (
                        <a
                          href={`#ledger-entry-${reversalId}`}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2"
                        >
                          <RotateCcw className="h-3 w-3" aria-hidden />
                          Reversed later
                        </a>
                      ) : null}
                      {entry.reversesEntryId ? (
                        <a
                          href={`#ledger-entry-${entry.reversesEntryId}`}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2"
                        >
                          <RotateCcw className="h-3 w-3" aria-hidden />
                          Reverses an earlier entry
                        </a>
                      ) : null}
                    </div>
                  </td>

                  <td
                    className={cn(
                      "whitespace-nowrap px-3 py-2 text-right tabular-nums font-medium",
                      entry.hoursDelta === null
                        ? "text-muted-foreground/70"
                        : entry.hoursDelta < 0
                          ? "text-destructive"
                          : "text-foreground",
                    )}
                  >
                    {delta ?? "Not provided"}
                  </td>

                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-foreground">
                    {after ?? (
                      <span className="text-muted-foreground/70">Not provided</span>
                    )}
                  </td>

                  <td className="px-3 py-2">
                    <SourceDoor
                      entry={entry}
                      requestHref={requestHref}
                      workweekHref={workweekHref}
                    />
                  </td>

                  <td className="px-3 py-2">
                    {entry.snapshotId || entry.calc !== null ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2"
                        onClick={() => setSnapshotEntry(entry)}
                      >
                        <FileSearch className="h-3.5 w-3.5" aria-hidden />
                        Open
                      </Button>
                    ) : (
                      /*
                        No door is rendered where none exists — a control the viewer cannot use
                        is not in the DOM. The red chip beside the sentence already says why.
                      */
                      <span className="text-xs text-muted-foreground/70">None recorded</span>
                    )}
                  </td>

                  <td className="px-3 py-2 text-muted-foreground">
                    {by ?? <span className="text-muted-foreground/70">Not recorded</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        This record is append-only: nothing on this screen can be edited or deleted, by anyone.
        A correction is a new entry.
        {viewer === "delegated"
          ? " You are looking at someone else's record."
          : null}
      </p>

      <RuleSnapshotDialog
        entry={snapshotEntry}
        onClose={() => setSnapshotEntry(null)}
      />
    </div>
  );
}

/**
 * The §12 source door. The server names the kind and the id; the host route knows the URL.
 * Where the host supplies no builder for a kind, the identity is still NAMED and the reader
 * is told plainly that this view has no door for it — never a link that goes nowhere.
 */
function SourceDoor({
  entry,
  requestHref,
  workweekHref,
}: {
  entry: LeaveLedgerEntry;
  requestHref?: (id: string) => string | null;
  workweekHref?: (id: string) => string | null;
}) {
  const source = entry.source;
  if (!source || !source.id) {
    return <span className="text-xs text-muted-foreground/70">—</span>;
  }

  if (source.kind === "leave_ledger") {
    return (
      <a
        href={`#ledger-entry-${source.id}`}
        className="inline-flex items-center gap-1 text-sm text-foreground underline underline-offset-2"
      >
        The entry it reverses
      </a>
    );
  }

  const href =
    source.kind === "leave_request"
      ? (requestHref?.(source.id) ?? null)
      : source.kind === "workweek"
        ? (workweekHref?.(source.id) ?? null)
        : null;

  const label =
    source.kind === "leave_request"
      ? "The request"
      : source.kind === "workweek"
        ? "The week worked"
        : "The record behind this";

  if (!href) {
    return (
      <span className="text-xs text-muted-foreground">
        {label} — not openable from this view
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm text-foreground underline underline-offset-2"
    >
      {label}
      <ArrowUpRight className="h-3 w-3" aria-hidden />
    </Link>
  );
}

/**
 * The rule door: the `hr.calculation_snapshot` behind this entry, as the server stored it.
 *
 * 🚨 `calc` IS RENDERED VERBATIM AND UNMAPPED. `rpc.ts` leaves the inner payload of an
 * evidence block untouched precisely so this dialog shows what the engine actually recorded,
 * not a tidied-up rewrite of it. This is the screen a wage claim is answered with.
 */
function RuleSnapshotDialog({
  entry,
  onClose,
}: {
  entry: LeaveLedgerEntry | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={entry !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>How this was calculated</DialogTitle>
          <DialogDescription>
            {entry?.sentence ?? "The calculation recorded against this entry."}
          </DialogDescription>
        </DialogHeader>

        {entry ? (
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Snapshot</dt>
              <dd className="break-all font-mono text-xs text-foreground">
                {entry.snapshotId ?? "None recorded"}
              </dd>
              <dt className="text-muted-foreground">Engine</dt>
              <dd className="text-foreground">
                {entry.engineKey
                  ? `${entry.engineKey}${entry.engineVersion ? ` v${entry.engineVersion}` : ""}`
                  : "Not recorded"}
              </dd>
              <dt className="text-muted-foreground">Entry</dt>
              <dd className="break-all font-mono text-xs text-foreground">{entry.id}</dd>
            </dl>

            {entry.calc === null ? (
              <p className="rounded-md border border-destructive/60 bg-destructive/5 p-3 text-sm text-destructive/90">
                No calculation was stored with this entry. That is the defect the
                &ldquo;Unexplained entry&rdquo; mark reports — the figure exists and the
                working behind it does not.
              </p>
            ) : (
              <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-xs text-foreground">
                {JSON.stringify(entry.calc, null, 2)}
              </pre>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
