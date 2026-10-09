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
import { Input } from "@ai-matrx/design-system/controls";
import { Label } from "@/components/ui/label";
import {
  MatrxDataTable,
  type MatrxColumnDef,
  type MatrxDataTableCopyConfig,
} from "@ai-matrx/design-system/data-table";
import { cn } from "@/lib/utils";

import type {
  LeaveLedgerEntry,
  LeaveLedgerView as LeaveLedger,
} from "../api/types";
import { LeaveBalanceBlock, formatHours } from "./LeaveBalanceBlock";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

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
export type LeaveLedgerFilter =
  "all" | "added" | "used_taken" | "approved_upcoming";

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

function matchesFilter(
  entry: LeaveLedgerEntry,
  filter: LeaveLedgerFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "added") {
    const kind = entry.entryKind;
    if (kind === null) return false;
    if (ADDED_KINDS.has(kind)) return true;
    return (
      kind === "adjustment" && entry.hoursDelta !== null && entry.hoursDelta > 0
    );
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

const LEDGER_COPY: MatrxDataTableCopyConfig<LeaveLedgerEntry> = {
  label: "Ledger entry",
  listLabel: "Leave ledger (this view)",
  location: "Leave balance — ledger",
  rowKind: "leave-ledger-entry",
  listKind: "leave-ledger",
  rowDescription: "One append-only entry on a leave policy's ledger.",
  listDescription: "The ledger entries of one leave policy, as currently shown.",
  humanRow: (entry) =>
    [
      `Date: ${entry.occurredOn ?? "—"}`,
      `What happened: ${entry.sentence ?? "No description"}`,
      `Change: ${signedHours(entry.hoursDelta) ?? "Not provided"}`,
      `Balance after: ${formatHours(entry.balanceAfter) ?? "Not provided"}`,
      `By: ${actorLabel(entry) ?? "Not recorded"}`,
    ].join("\n"),
};

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
  const [snapshotEntry, setSnapshotEntry] = useState<LeaveLedgerEntry | null>(
    null,
  );

  /**
   * Newest first. `hr.leave_ledger_view` returns oldest-first because `running_sum` is
   * accumulated in that order and reversing it server-side would break the running total it
   * computes; §12 asks for newest-first on screen, so the REVERSAL IS A PRESENTATION CHOICE
   * over rows whose numbers were all computed by the server.
   */
  const rows = useMemo(
    () =>
      ledger.entries
        .filter((e) => matchesFilter(e, filter))
        .slice()
        .reverse(),
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

  /** The anchors the old table used (`#ledger-entry-<id>`): scroll the entry's row into view. */
  const goToEntry = (id: string) => {
    document
      .querySelector(`tr[data-row-id="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const columns: MatrxColumnDef<LeaveLedgerEntry>[] = [
    {
      id: "date",
      header: "Date",
      accessorFn: (entry) => entry.occurredOn ?? "",
      cell: (entry) => (
        <span className="whitespace-nowrap tabular-nums text-muted-foreground">
          {entry.occurredOn ?? "—"}
        </span>
      ),
      copyValue: (entry) => entry.occurredOn ?? "—",
      filter: "text",
      width: 120,
    },
    {
      id: "what",
      header: "What happened",
      accessorFn: (entry) => entry.sentence ?? "",
      cell: (entry) => {
        const isReversed = reversedIds.has(entry.id);
        const reversalId = reversalByTarget.get(entry.id) ?? null;
        const isDivergent = ledger.divergenceAtEntryId === entry.id;
        return (
          <div className="min-w-0">
            <span
              className={cn(
                "text-foreground",
                /* Reversal pairing: struck through, never removed. Neither disappears. */
                isReversed
                  ? "line-through decoration-muted-foreground/60"
                  : null,
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
                <button
                  type="button"
                  onClick={() => goToEntry(reversalId)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden />
                  Reversed later
                </button>
              ) : null}
              {entry.reversesEntryId ? (
                <button
                  type="button"
                  onClick={() => goToEntry(entry.reversesEntryId as string)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden />
                  Reverses an earlier entry
                </button>
              ) : null}
            </div>
          </div>
        );
      },
      filter: "text",
      width: 420,
    },
    {
      id: "change",
      header: "Change",
      accessorFn: (entry) => entry.hoursDelta,
      cell: (entry) => (
        <span
          className={cn(
            "whitespace-nowrap tabular-nums font-medium",
            entry.hoursDelta === null
              ? "text-muted-foreground/70"
              : entry.hoursDelta < 0
                ? "text-destructive"
                : "text-foreground",
          )}
        >
          {signedHours(entry.hoursDelta) ?? "Not provided"}
        </span>
      ),
      copyValue: (entry) => signedHours(entry.hoursDelta) ?? "Not provided",
      filter: "number",
      align: "right",
      width: 120,
    },
    {
      id: "balance-after",
      header: "Balance after",
      accessorFn: (entry) => entry.balanceAfter,
      cell: (entry) => {
        const after = formatHours(entry.balanceAfter);
        return after ? (
          <span className="whitespace-nowrap tabular-nums text-foreground">
            {after}
          </span>
        ) : (
          <span className="text-muted-foreground/70">Not provided</span>
        );
      },
      copyValue: (entry) => formatHours(entry.balanceAfter) ?? "Not provided",
      filter: "number",
      align: "right",
      width: 130,
    },
    {
      id: "source",
      header: "Source",
      accessorFn: (entry) => entry.source?.kind ?? "",
      cell: (entry) => (
        <SourceDoor
          entry={entry}
          requestHref={requestHref}
          workweekHref={workweekHref}
          onGoToEntry={goToEntry}
        />
      ),
      copyValue: (entry) => entry.source?.kind ?? "—",
      width: 220,
    },
    {
      id: "rule",
      header: "Rule",
      accessorFn: (entry) =>
        entry.snapshotId || entry.calc !== null ? "Recorded" : "None recorded",
      cell: (entry) =>
        entry.snapshotId || entry.calc !== null ? (
          <Button
            icon={<FileSearch aria-hidden />}
            type="button"
            variant="quiet"
            onClick={() => setSnapshotEntry(entry)}
          >
            Open
          </Button>
        ) : (
          /* No door is rendered where none exists. */
          <span className="text-xs text-muted-foreground/70">
            None recorded
          </span>
        ),
      filter: "select",
      width: 130,
    },
    {
      id: "by",
      header: "By",
      accessorFn: (entry) => actorLabel(entry) ?? "",
      cell: (entry) =>
        actorLabel(entry) ?? (
          <span className="text-muted-foreground/70">Not recorded</span>
        ),
      copyValue: (entry) => actorLabel(entry) ?? "Not recorded",
      filter: "text",
      width: 180,
    },
  ];

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
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
            aria-hidden
          />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-destructive">
              This ledger does not add up, and these figures cannot be relied
              on.
            </p>
            <p className="mt-0.5 text-destructive/90">
              The running total of every change disagrees with the recorded
              balance. The first row where they part company is marked below.
            </p>
            {/*
              The id is NOT printed. A bare uuid on screen is a dead end with extra steps —
              the row itself is the identity, so the banner opens it.
            */}
            {ledger.divergenceAtEntryId ? (
              <button
                type="button"
                onClick={() => goToEntry(ledger.divergenceAtEntryId as string)}
                className="mt-1.5 inline-block text-sm font-medium text-destructive underline underline-offset-2"
              >
                Go to the first entry where they part company
              </button>
            ) : null}
          </div>
          <ErrorAlchemyMenu className="ml-auto" />
        </div>
      ) : null}

      {ledger.unexplainedEntryCount !== null &&
      ledger.unexplainedEntryCount > 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/60 bg-destructive/5 p-3 text-sm">
          <ShieldAlert
            className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
            aria-hidden
          />
          <p className="text-destructive/90">
            {ledger.unexplainedEntryCount === 1
              ? "One entry on this policy has no calculation behind it."
              : `${ledger.unexplainedEntryCount} entries on this policy have no calculation behind them.`}{" "}
            Every rule-driven entry is supposed to carry the snapshot that
            produced it. These are marked in the table.
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
              variant={filter === key ? "primary" : "outline"}
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
                className="w-40"
              />
            </div>
            {asOf ? (
              <Button
                type="button"
                variant="quiet"
                onClick={() => onAsOfChange(null)}
              >
                Today
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        {FILTER_EXPLANATION[filter]}
      </p>

      <MatrxDataTable<LeaveLedgerEntry>
        tableId="hr/leave/ledger"
        data={rows}
        columns={columns}
        getRowId={(entry) => entry.id}
        viewTabs={false}
        pageSize={0}
        density="condensed"
        searchText={(entry) =>
          `${entry.sentence ?? ""} ${actorLabel(entry) ?? ""}`
        }
        toolbar={{ searchPlaceholder: "Search this ledger" }}
        detail={{ enabled: false }}
        copy={LEDGER_COPY}
        rowClassName={(entry) =>
          ledger.divergenceAtEntryId === entry.id
            ? "bg-destructive/10"
            : undefined
        }
        emptyState={{
          title:
            ledger.entryCount === 0
              ? "Nothing has been added to or taken from this policy yet."
              : "No entries match this filter.",
        }}
      />

      <p className="text-xs text-muted-foreground">
        This record is append-only: nothing on this screen can be edited or
        deleted, by anyone. A correction is a new entry.
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
  onGoToEntry,
}: {
  entry: LeaveLedgerEntry;
  requestHref?: (id: string) => string | null;
  workweekHref?: (id: string) => string | null;
  onGoToEntry: (id: string) => void;
}) {
  const source = entry.source;
  if (!source || !source.id) {
    return <span className="text-xs text-muted-foreground/70">—</span>;
  }

  if (source.kind === "leave_ledger") {
    return (
      <button
        type="button"
        onClick={() => onGoToEntry(source.id as string)}
        className="inline-flex items-center gap-1 text-sm text-foreground underline underline-offset-2"
      >
        The entry it reverses
      </button>
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
    <Dialog
      open={entry !== null}
      onOpenChange={(open) => (open ? null : onClose())}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>How this was calculated</DialogTitle>
          <DialogDescription>
            {entry?.sentence ?? "The calculation recorded against this entry."}
          </DialogDescription>
        </DialogHeader>

        {entry ? (
          <div className="flex max-h-[60dvh] flex-col gap-3 overflow-y-auto">
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
              <dd className="break-all font-mono text-xs text-foreground">
                {entry.id}
              </dd>
            </dl>

            {entry.calc === null ? (
              <p className="rounded-md border border-destructive/60 bg-destructive/5 p-3 text-sm text-destructive-ink/90">
                No calculation was stored with this entry. That is the defect
                the &ldquo;Unexplained entry&rdquo; mark reports — the figure
                exists and the working behind it does not.
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
