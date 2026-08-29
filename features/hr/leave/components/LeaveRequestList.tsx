/**
 * features/hr/leave/components/LeaveRequestList.tsx — SPEC-LEAVE §4.1's request history.
 *
 * *"…and what happened to what they asked for."*
 *
 * 🚨 EVERY ROW OPENS (no-dead-ends). A request is an identity this surface names, so it opens
 * — in place, into the whole of what the server knows about it: the days, the hours, the
 * decision, the denial reason and every advisory the checks raised. It opens IN PLACE and not
 * into a route because there is no request-detail route in the product and inventing a URL
 * that 404s is the dead end the law exists to prevent.
 *
 * 🚨 THE CONTROL IS ABSENT WHERE IT IS NOT LAWFUL, NEVER DISABLED (SPEC-UI-IA §4.2).
 * Read live off the two doors, and there are exactly three lawful acts, one per state:
 * `draft` DISCARDS (`hr.leave_request_discard` — never filed, so nothing is reversed),
 * `submitted` WITHDRAWS (`hr.leave_request_cancel`; no ledger entry ever existed), `approved`
 * ASKS TO CANCEL (a `leave_cancellation` workflow, because the hours are encumbered). `taken`,
 * `partially_taken`, `denied` and `cancelled` have no control at all — each is a thing that
 * HAPPENED, and both doors refuse them with the act that IS available. So the button is in the
 * DOM for exactly three states.
 *
 * 🚨 DISCARD IS NOT CANCEL, AND ONE CONTROL MUST NEVER SERVE BOTH. They call different doors
 * with different consequences; `hr.leave_request_cancel` answers a draft with
 * `not_cancellable`, which is precisely the gap that left a draft on this page forever. The
 * action descriptor below carries WHICH door, so the two can never drift into one button.
 *
 * 🚨 NO SECOND INBOX. Nothing here approves, denies, escalates or reassigns anything.
 * `/hr/tasks` is THE inbox and the workflow engine projects leave steps into it.
 */

"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { isHrDenied, isHrFailed } from "@/features/hr/types";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { cancelLeaveRequest, discardLeaveRequest } from "../api/service";
import type { LeaveRequestState, MyLeaveRequest } from "../api/types";
import { formatHours } from "./LeaveBalanceBlock";

/** The frozen enum, said in words. §12 LAW 3a: no cell prints a type name. */
const STATE_WORDS: Record<LeaveRequestState, string> = {
  draft: "Not sent yet",
  submitted: "Waiting for a decision",
  approved: "Approved",
  denied: "Denied",
  cancelled: "Cancelled",
  taken: "Taken",
  partially_taken: "Partly taken",
};

function stateTone(state: LeaveRequestState | null): "default" | "secondary" | "destructive" {
  if (state === "denied") return "destructive";
  if (state === "approved" || state === "taken" || state === "partially_taken") return "default";
  return "secondary";
}

/**
 * Which states the server will actually act on, which DOOR does it, and what it will do.
 *
 * `door` is the point of this shape: `discard` and `cancel` are different acts on different
 * server functions, and a descriptor that carried only wording would let one button send a
 * draft to the cancel door — which refuses it.
 */
type RequestAction = {
  door: "discard" | "cancel";
  label: string;
  title: string;
  body: string;
  /** Said after it works, in the same words as the act. */
  done: string;
};

function requestAction(state: LeaveRequestState | null): RequestAction | null {
  if (state === "draft") {
    return {
      door: "discard",
      label: "Discard",
      title: "Discard this request?",
      body: "It was never sent, so nothing has been taken from your balance and nobody was asked about it. Discarding removes it from this page.",
      done: "Discarded. Nothing was taken from your balance.",
    };
  }
  if (state === "submitted") {
    return {
      door: "cancel",
      label: "Withdraw",
      title: "Withdraw this request?",
      body: "It has not been decided yet, so nothing has been taken from your balance. Withdrawing removes it from your approver's list.",
      done: "Withdrawn. Nothing was taken from your balance.",
    };
  }
  if (state === "approved") {
    return {
      door: "cancel",
      label: "Ask to cancel",
      title: "Ask to cancel this approved time off?",
      body: "These hours are already held against your balance, so cancelling has to be approved like the original request was. Your approver will see the request.",
      done: "Sent. Your approver will decide on the cancellation.",
    };
  }
  return null;
}

export interface LeaveRequestListProps {
  requests: MyLeaveRequest[];
  /** Re-read the surface after a withdrawal or cancellation. */
  onChanged: () => void;
}

export function LeaveRequestList({ requests, onChanged }: LeaveRequestListProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState<MyLeaveRequest | null>(null);
  const [busy, setBusy] = useState(false);

  const action = pending ? requestAction(pending.state) : null;

  async function confirmAction() {
    if (!pending || !action) return;
    setBusy(true);
    const res =
      action.door === "discard"
        ? await discardLeaveRequest({ requestId: pending.id })
        : await cancelLeaveRequest({ requestId: pending.id });
    setBusy(false);
    setPending(null);

    if (!res.ok) {
      /* The server's own sentence, verbatim — `reason` is a code and never reaches the page.
         Both doors refuse in the same dialect and each refusal already names what to do
         instead, so there is nothing for this page to add. */
      toast.error(
        isHrDenied(res)
          ? (res.detail ?? "That did not go through, and no reason was given.")
          : isHrFailed(res)
            ? res.message
            : "That did not go through.",
      );
      return;
    }

    toast.success(action.done);
    onChanged();
  }

  if (requests.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Your requests</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You have not asked for any time off here yet.
        </p>
      </section>
    );
  }

  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h2 className="text-sm font-semibold text-foreground">Your requests</h2>

      <ul className="flex flex-col gap-2">
        {requests.map((req) => {
          const open = openId === req.id;
          const act = requestAction(req.state);
          const advisories = req.conflictCheck?.advisory ?? [];
          const hard = req.conflictCheck?.hard ?? [];

          return (
            <li
              key={req.id}
              id={`request-${req.id}`}
              className="rounded-lg border border-border bg-card"
            >
              <div className="flex flex-wrap items-center gap-2 p-3">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : req.id)}
                  aria-expanded={open}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  {open ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className="min-w-0 truncate text-sm font-medium text-foreground">
                    {req.policyName ?? "Time off"}
                  </span>
                  <span className="whitespace-nowrap text-sm text-muted-foreground">
                    {req.startsOn ?? "—"}
                    {req.endsOn && req.endsOn !== req.startsOn ? ` → ${req.endsOn}` : ""}
                  </span>
                  <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                    {formatHours(req.requestedHours) ?? "Hours not provided"}
                  </span>
                </button>

                <Badge variant={stateTone(req.state)}>
                  {req.state ? STATE_WORDS[req.state] : "State not recorded"}
                </Badge>

                {act ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setPending(req)}
                  >
                    {act.label}
                  </Button>
                ) : null}
              </div>

              {open ? (
                <div className="flex flex-col gap-2 border-t border-border p-3 text-sm">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                    <dt className="text-muted-foreground">Asked for</dt>
                    <dd className="tabular-nums text-foreground">
                      {formatHours(req.requestedHours) ?? "Not provided"}
                    </dd>
                    {req.approvedHours !== null ? (
                      <>
                        <dt className="text-muted-foreground">Approved</dt>
                        <dd className="tabular-nums text-foreground">
                          {formatHours(req.approvedHours)}
                        </dd>
                      </>
                    ) : null}
                    {req.decidedAt ? (
                      <>
                        <dt className="text-muted-foreground">Decided</dt>
                        <dd className="text-foreground">{req.decidedAt}</dd>
                      </>
                    ) : null}
                    {req.denialReason ? (
                      <>
                        <dt className="text-muted-foreground">Reason given</dt>
                        <dd className="text-foreground">{req.denialReason}</dd>
                      </>
                    ) : null}
                    {req.leaveCaseLinked ? (
                      <>
                        <dt className="text-muted-foreground">Leave case</dt>
                        {/* The server says only THAT a case is linked, never which (§9.6). */}
                        <dd className="text-foreground">
                          This request is part of a leave case HR is handling with you.
                        </dd>
                      </>
                    ) : null}
                  </dl>

                  {req.dayParts.length > 0 ? (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">
                        Hours you asked for, day by day
                      </p>
                      <ul className="mt-1 flex flex-wrap gap-2">
                        {req.dayParts.map((p) => (
                          <li
                            key={p.date}
                            className="rounded border border-border px-2 py-0.5 text-xs tabular-nums"
                          >
                            {p.date} · {formatHours(p.hours)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {hard.length > 0 ? (
                    <div className="rounded-md border border-destructive/60 bg-destructive/5 p-2">
                      <p className="text-xs font-medium text-destructive">
                        What stopped this
                      </p>
                      <ul className="mt-1 flex flex-col gap-1">
                        {hard.map((f, i) => (
                          <li key={f.code ?? i} className="text-sm text-destructive/90">
                            {f.message ?? "No detail was recorded for this finding."}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {advisories.length > 0 ? (
                    <div className="rounded-md border border-border p-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        What your approver was told
                      </p>
                      <ul className="mt-1 flex flex-col gap-1">
                        {advisories.map((f, i) => (
                          <li key={f.code ?? i} className="text-sm text-muted-foreground">
                            {f.message ?? "No detail was recorded for this note."}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {req.conflictCheck === null ? (
                    <p className={cn("text-xs", "text-muted-foreground")}>
                      No checks were recorded against this request.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={pending !== null && action !== null}
        onOpenChange={(open) => (open ? null : setPending(null))}
        title={action?.title ?? ""}
        description={action?.body ?? ""}
        confirmLabel={action?.label ?? "Confirm"}
        cancelLabel="Keep it"
        busy={busy}
        onConfirm={confirmAction}
      />

      {busy ? (
        <span className="sr-only" role="status">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Working on that request.
        </span>
      ) : null}
    </section>
  );
}
