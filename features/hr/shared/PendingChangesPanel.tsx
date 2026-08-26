// features/hr/shared/PendingChangesPanel.tsx
//
// SEEING AND CANCELLING PENDING CHANGES (SPEC-EMPLOYEES §6.2).
//
// Every future-dated row across position, compensation and reporting line for ONE
// employment, plus everything still in flight — in one place, because a scheduled
// change nobody can find is a change nobody can stop.
//
// The four rules:
//  1. WHAT CHANGES, ITS EFFECTIVE DATE, WHO REQUESTED IT, ITS APPROVAL STATE, and
//     — for anything still in flight — WHERE IT IS NOW.
//  2. CANCEL IS AVAILABLE UNTIL THE EFFECTIVE DATE ARRIVES. After the date the row
//     is history, and the only correction path is §6.3's question on a new edit.
//  3. CANCELLING ERASES NOTHING. It soft-deletes the future row and re-opens the
//     prior row's `effective_to` in ONE audited action, and the cancellation is
//     itself a recorded event. The UI says so, in the dialog, before it happens —
//     a person who thinks they are deleting history will not press the button.
//  4. THE HEADER CARRIES AT MOST ONE CHIP (`<PendingChip>`), and the chip is a
//     DOOR to this panel. Never a chip per change.
//
// KNOWN SERVER GAP (verified against `hr_pending_changes` 2026-08-26): §6.2 asks
// for "from what to what", but the door returns only the FUTURE row — the prior
// value is not in the payload. This panel therefore renders what the change WILL
// be and never invents a "was". Widening the RPC is the server lane's call; a
// client-side guess at the prior value would be a fabricated audit statement.

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BadgeDollarSign,
  Briefcase,
  CalendarClock,
  GitBranch,
  Hourglass,
} from "lucide-react";

import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { cancelHrPendingChange, fetchHrPendingChanges } from "../service";
import type {
  HrInFlightRequest,
  HrPendingChanges,
  HrPendingCompensation,
  HrPendingKind,
  HrPendingPosition,
  HrPendingReportingLine,
} from "../types";
import { hrFormatDay, hrToday } from "./EffectiveDatedForm";
import { HrError, HrLoading, HrNoAccess } from "./HrStates";

// ── The chip ────────────────────────────────────────────────────────────────

/**
 * ONE chip. Not one per change — "at most one chip" is the whole rule (§6.2), and
 * it is a door: it opens the panel below.
 *
 * With exactly one change the caller names it (`label`), because "1 pending
 * change" tells a reader less than "Pay change 1 Oct".
 */
export function PendingChip({
  count,
  href,
  label,
  className,
}: {
  count: number;
  href: string;
  label?: string;
  className?: string;
}) {
  if (count <= 0) return null;

  const text =
    label?.trim() ||
    (count === 1 ? "1 pending change" : `${count} pending changes`);

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-muted/60 px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent sm:min-h-7",
        className,
      )}
    >
      <CalendarClock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      {text}
    </Link>
  );
}

// ── The panel ───────────────────────────────────────────────────────────────

type CancelTarget = {
  kind: HrPendingKind;
  id: string;
  what: string;
  effectiveFrom: string;
};

export function PendingChangesPanel({
  employmentId,
  onCancelled,
  className,
}: {
  employmentId: string;
  onCancelled?: () => void;
  className?: string;
}) {
  const [data, setData] = useState<HrPendingChanges | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [denied, setDenied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [target, setTarget] = useState<CancelTarget | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    let cancelledEffect = false;
    setIsLoading(true);

    void (async () => {
      const result = await fetchHrPendingChanges(employmentId);
      if (cancelledEffect) return;
      if (result.ok) {
        setData(result.data);
        setError(null);
        setDenied(false);
      } else if (result.kind === "denied") {
        setDenied(true);
        setError(null);
      } else {
        setError(result);
        setDenied(false);
      }
      setIsLoading(false);
    })();

    return () => {
      cancelledEffect = true;
    };
  }, [employmentId, reloadToken]);

  const submitCancel = async (reason: string) => {
    if (!target) return;
    setCancelling(true);
    try {
      const result = await cancelHrPendingChange({
        kind: target.kind,
        id: target.id,
        reason,
      });
      if (result.ok) {
        toast.success(
          `Cancelled — ${target.what} will not take effect on ${hrFormatDay(target.effectiveFrom)}.`,
        );
        setTarget(null);
        reload();
        onCancelled?.();
      } else {
        toast.error(
          result.kind === "denied"
            ? result.detail?.trim() || "That change is not yours to cancel."
            : result.message,
        );
      }
    } finally {
      setCancelling(false);
    }
  };

  if (isLoading) return <HrLoading variant="panel" rows={3} className={className} />;
  if (denied) {
    return (
      <HrNoAccess
        sentence="Scheduled changes for this person aren't yours to see."
        className={className}
      />
    );
  }
  if (error) {
    return (
      <HrError
        operation="Pending changes"
        error={error}
        onRetry={reload}
        className={className}
      />
    );
  }
  if (!data) return null;

  const today = hrToday();
  const rows = [
    ...data.positions.map((row) => positionRow(row)),
    ...data.compensation.map((row) => compensationRow(row)),
    ...data.reporting_lines.map((row) => reportingLineRow(row)),
  ].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

  const inFlight = data.in_flight ?? [];

  if (rows.length === 0 && inFlight.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground",
          className,
        )}
      >
        Nothing is scheduled to change for this person.
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {rows.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            Scheduled changes
          </h3>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {rows.map((row) => {
              const stillAhead = row.effectiveFrom > today;
              return (
                <li
                  key={`${row.kind}-${row.id}`}
                  className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:gap-4"
                >
                  <row.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {row.what}
                    </p>
                    {row.detail ? (
                      <p className="text-xs text-muted-foreground">{row.detail}</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      Takes effect {hrFormatDay(row.effectiveFrom)}
                      {row.requestedBy ? ` · requested by ${row.requestedBy}` : ""}
                      {row.approvalState ? ` · ${row.approvalState}` : ""}
                    </p>
                  </div>
                  {row.canCancel && stillAhead ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-h-11 shrink-0 sm:min-h-9"
                      onClick={() =>
                        setTarget({
                          kind: row.kind,
                          id: row.id,
                          what: row.what,
                          effectiveFrom: row.effectiveFrom,
                        })
                      }
                    >
                      Cancel
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            Cancelling a scheduled change removes only the future row and puts the
            current record back the way it was. Nothing in the history is erased,
            and the cancellation is recorded.
          </p>
        </section>
      ) : null}

      {inFlight.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            Waiting on a decision
          </h3>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {inFlight.map((request) => (
              <li key={request.instance_id} className="flex gap-3 p-3">
                <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    {inFlightTitle(request)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      request.current_step
                        ? `Now with: ${request.current_step}`
                        : null,
                      request.submitted_at
                        ? `submitted ${hrFormatDay(request.submitted_at.slice(0, 10))}`
                        : null,
                      request.due_at
                        ? `due ${hrFormatDay(request.due_at.slice(0, 10))}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <TextInputDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open && !cancelling) setTarget(null);
        }}
        title="Cancel this scheduled change?"
        description={
          target
            ? `${target.what} is set to take effect ${hrFormatDay(target.effectiveFrom)}. Cancelling stops it and restores the current record. Nothing in the history is erased, and this cancellation is recorded with your reason.`
            : undefined
        }
        placeholder="Why is this being cancelled?"
        confirmLabel="Cancel the change"
        cancelLabel="Keep it"
        busy={cancelling}
        multiline
        rows={3}
        validate={(value) =>
          value.trim().length < 3
            ? "Say why in a few words — the reason is the record."
            : null
        }
        onConfirm={submitCancel}
      />
    </div>
  );
}

// ── Row shaping ─────────────────────────────────────────────────────────────

type PanelRow = {
  kind: HrPendingKind;
  id: string;
  what: string;
  detail: string | null;
  effectiveFrom: string;
  requestedBy: string | null;
  approvalState: string | null;
  canCancel: boolean;
  icon: typeof Briefcase;
};

function positionRow(row: HrPendingPosition): PanelRow {
  const parts = [row.job_title, row.department, row.location].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  const extras = [
    row.fte !== null ? `${row.fte} FTE` : null,
    row.worker_class,
    row.flsa_status,
  ].filter((part): part is string => Boolean(part));

  return {
    kind: "position",
    id: row.id,
    what: parts.length > 0 ? `Position → ${parts.join(" · ")}` : "Position change",
    detail:
      [extras.join(" · "), row.change_reason].filter(Boolean).join(" — ") || null,
    effectiveFrom: row.effective_from,
    requestedBy: row.requested_by,
    approvalState: null,
    canCancel: row.can_cancel,
    icon: Briefcase,
  };
}

function compensationRow(row: HrPendingCompensation): PanelRow {
  const amount =
    row.amount !== null
      ? `${row.currency ?? ""} ${row.amount}${row.per_unit ? ` per ${row.per_unit}` : ""}`.trim()
      : null;

  return {
    kind: "compensation",
    id: row.id,
    what: amount
      ? `${row.component_kind ?? "Pay"} → ${amount}`
      : `${row.component_kind ?? "Pay"} change`,
    detail:
      [row.pay_basis, row.change_reason].filter(Boolean).join(" — ") || null,
    effectiveFrom: row.effective_from,
    requestedBy: null,
    approvalState: row.approved_at ? "approved" : "not yet approved",
    canCancel: row.can_cancel,
    icon: BadgeDollarSign,
  };
}

function reportingLineRow(row: HrPendingReportingLine): PanelRow {
  return {
    kind: "reporting_line",
    id: row.id,
    what: row.line_kind
      ? `Reporting line (${row.line_kind}) changes`
      : "Reporting line changes",
    detail: null,
    effectiveFrom: row.effective_from,
    requestedBy: null,
    approvalState: null,
    canCancel: row.can_cancel,
    icon: GitBranch,
  };
}

/**
 * A workflow instance's own words, never a raw `flow_key`. LAW 3a: no cell, badge
 * or empty state ever prints a type name at a person.
 */
function inFlightTitle(request: HrInFlightRequest): string {
  const readable = request.flow_key
    .replace(/[_.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const titled = readable
    ? readable.charAt(0).toUpperCase() + readable.slice(1)
    : "Request";
  return request.state ? `${titled} — ${request.state.replace(/_/g, " ")}` : titled;
}
