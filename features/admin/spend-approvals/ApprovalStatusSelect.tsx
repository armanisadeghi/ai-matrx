"use client";

/**
 * Inline approval-status dropdown, shared by every spend board and the approvals page.
 * One popover per cell: pick Waiting / Approved / Temporary / Rejected, then the same popover turns into a
 * small confirm (cost per run, est./month, optional note; an expiry date for Temporary) — nothing else
 * opens, nothing shifts.
 * The parent owns the write (optimistic update + rollback); this only collects the decision.
 */
import { useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Button } from "@ai-matrx/design-system/controls";
import { formatUsd } from "@ai-matrx/kit/format";
import { ApprovalStatusText } from "./RunApprovalCell";
import {
  APPROVAL_STATUS_LABEL,
  expiryLabel,
  useApprovalColorKnobs,
  type ApprovalDecision,
  type ApprovalStatus,
} from "./spendApprovals";

const ORDER: ApprovalStatus[] = ["waiting", "approved", "temporary", "rejected"];
const CONFIRM_LABEL: Record<ApprovalStatus, string> = {
  waiting: "Reopen",
  approved: "Approve",
  temporary: "Approve until",
  rejected: "Reject",
};
const DECISION: Record<ApprovalStatus, ApprovalDecision> = {
  waiting: "reopen",
  approved: "approve",
  temporary: "approve_temporary",
  rejected: "reject",
};

/** yyyy-mm-dd for a date input, `days` from now (local calendar). */
export function dateInputValue(days: number, from: Date = new Date()): string {
  const d = new Date(from.getTime() + days * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** End of the picked local day, as an ISO instant (the approval lasts the whole day). */
export function endOfLocalDayIso(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export function ApprovalStatusSelect({
  status,
  name,
  costPerRun,
  estMonthly,
  expiresAt = null,
  onDecide,
}: {
  status: ApprovalStatus;
  name: string;
  costPerRun: number | null;
  estMonthly: number | null;
  /** A temporary approval's current expiry (pre-fills the date when extending one). */
  expiresAt?: string | null;
  /** Throws to refuse; the parent rolls the optimistic status back. */
  onDecide: (decision: ApprovalDecision, next: ApprovalStatus, note: string, expiresAt: string | null) => Promise<void>;
}) {
  // Every dollar figure here is to the cent (Arman 2026-10-10); points stay off this confirm.
  const format = (usd: number) => formatUsd(usd, { digits: 2 });
  const knobs = useApprovalColorKnobs();
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState<ApprovalStatus | null>(null);
  const [note, setNote] = useState("");
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const untilIso = next === "temporary" ? endOfLocalDayIso(until) : null;
  const untilValid = next !== "temporary" || (untilIso != null && Date.parse(untilIso) > Date.now());

  const close = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setNext(null);
      setNote("");
    }
  };
  const pick = (s: ApprovalStatus) => {
    if (s === "temporary") {
      setUntil(
        status === "temporary" && expiresAt
          ? dateInputValue(0, new Date(expiresAt))
          : dateInputValue(knobs?.temporaryDefaultDays ?? 7),
      );
    }
    setNext(s);
  };
  const confirm = async () => {
    if (!next || !untilValid) return;
    setBusy(true);
    setOpen(false);
    try {
      await onDecide(DECISION[next], next, note.trim(), untilIso);
    } finally {
      setBusy(false);
      setNext(null);
      setNote("");
    }
  };

  return (
    <Popover open={open} onOpenChange={close}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Approval status: ${APPROVAL_STATUS_LABEL[status]}`}
          className="inline-flex h-6 items-center gap-1 rounded px-1 hover:bg-muted"
        >
          <ApprovalStatusText status={status} />
          {busy ? <Loader2 className="size-3 animate-spin text-muted-foreground" /> : <ChevronDown className="size-3 text-muted-foreground" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-1" onClick={(e) => e.stopPropagation()}>
        {!next ? (
          <div role="listbox" className="flex flex-col">
            {ORDER.map((s) => (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected={s === status}
                disabled={s === status && s !== "temporary"}
                onClick={() => pick(s)}
                className="flex h-7 items-center justify-between rounded px-2 text-left hover:bg-muted disabled:opacity-60"
              >
                <ApprovalStatusText status={s} />
                {s === status && <Check className="size-3" />}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2 p-2 text-xs">
            <div className="font-medium">{`${APPROVAL_STATUS_LABEL[next]}: ${name}`}</div>
            <div className="text-muted-foreground">
              {`${costPerRun == null ? "—" : format(costPerRun)} a run · ${estMonthly == null ? "—" : format(estMonthly)}/mo`}
            </div>
            {next === "temporary" && (
              <label className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Until</span>
                {/* ui-exception: a date value, not prose */}
                <input
                  type="date"
                  value={until}
                  min={dateInputValue(0)}
                  onChange={(e) => setUntil(e.target.value)}
                  aria-label="Expires on"
                  className="h-7 rounded-md border border-border bg-background px-2 text-xs"
                />
              </label>
            )}
            {next === "temporary" && untilIso && (
              <div className={untilValid ? "text-muted-foreground" : "text-destructive"}>
                {untilValid ? `${expiryLabel(untilIso)}, then Rejected` : "Pick a future date"}
              </div>
            )}
            {/* ui-exception: a free-text note, not prose */}
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note"
              aria-label="Note"
              className="h-7 rounded-md border border-border bg-background px-2 text-xs"
            />
            <div className="flex justify-end gap-1">
              <Button variant="quiet" onClick={() => close(false)}>Cancel</Button>
              <Button variant={next === "rejected" ? "danger" : "primary"} onClick={confirm} disabled={!untilValid}>
                {CONFIRM_LABEL[next]}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
