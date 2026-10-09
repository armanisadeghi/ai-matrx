"use client";

/**
 * Inline approval-status dropdown, shared by every spend board and the approvals page.
 * One popover per cell: pick Waiting / Approved / Rejected, then the same popover turns into a
 * small confirm (cost per run, est./month, optional note) — nothing else opens, nothing shifts.
 * The parent owns the write (optimistic update + rollback); this only collects the decision.
 */
import { useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Button } from "@ai-matrx/design-system/controls";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { ApprovalStatusText } from "./RunApprovalCell";
import { APPROVAL_STATUS_LABEL, type ApprovalDecision, type ApprovalStatus } from "./spendApprovals";

const ORDER: ApprovalStatus[] = ["waiting", "approved", "rejected"];
const CONFIRM_LABEL: Record<ApprovalStatus, string> = { waiting: "Reopen", approved: "Approve", rejected: "Reject" };
const DECISION: Record<ApprovalStatus, ApprovalDecision> = { waiting: "reopen", approved: "approve", rejected: "reject" };

export function ApprovalStatusSelect({
  status,
  name,
  costPerRun,
  estMonthly,
  onDecide,
}: {
  status: ApprovalStatus;
  name: string;
  costPerRun: number | null;
  estMonthly: number | null;
  /** Throws to refuse; the parent rolls the optimistic status back. */
  onDecide: (decision: ApprovalDecision, next: ApprovalStatus, note: string) => Promise<void>;
}) {
  const { format } = useCostDisplay();
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState<ApprovalStatus | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const close = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setNext(null);
      setNote("");
    }
  };
  const confirm = async () => {
    if (!next) return;
    setBusy(true);
    setOpen(false);
    try {
      await onDecide(DECISION[next], next, note.trim());
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
                disabled={s === status}
                onClick={() => setNext(s)}
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
              <Button variant={next === "rejected" ? "danger" : "primary"} onClick={confirm}>
                {CONFIRM_LABEL[next]}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
