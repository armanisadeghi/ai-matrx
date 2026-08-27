"use client";

/**
 * features/hr/time/periods/components/PeriodTransitionBar.tsx — the period state machine's controls.
 *
 * 🚨 EVERY CONSEQUENCE IS STATED BEFORE THE CLICK, NEVER DISCOVERED IN A TOAST.
 * Three of these transitions are one-way and one of them (`lock`) ends editing for good, so the
 * confirm dialog carries `offer.consequence` — the dispute sentence, the reopen notice, the
 * after-lock rule — as its body. A consequence a user reads *after* acting is a consequence they
 * could not consent to.
 *
 * 🚨 REOPEN REQUIRES A REASON AND SAYS, IN PLAIN WORDS, THAT IT DOES NOT UN-EXPORT AND DOES NOT
 * RE-PAY. The reason is required by `hr.pay_period_transition` itself; the sentence is
 * {@link REOPEN_NOTICE} before the click, and the server's own `notice` verbatim after it.
 *
 * 🚨 A CONTROL THAT IS NOT OFFERED SAYS WHY. `unavailableBecause` is never null on an unoffered
 * action — a greyed button with no explanation is the same defect as a bare 403 (SPEC-ACCESS §4.2).
 *
 * `window.confirm` / `alert` / `prompt` are banned repo-wide: this uses `confirm()` from the
 * ConfirmDialogHost and `<TextInputDialog>` for the reason.
 */

import { useState } from "react";
import { Loader2, Lock, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { toast } from "@/lib/toast";
import { transitionPayPeriod } from "../../api/service";
import { HrRpcError } from "../../api/rpc";
import type { HrFixtureCase } from "@/features/hr/mock/transport";
import type { PayPeriodRow, PayPeriodState } from "../../api/types";
import {
  REOPEN_NOTICE,
  disputeSentence,
  offeredTransitions,
  type PeriodActionOffer,
  type PeriodViewerRole,
} from "../periodStateMachine";

export interface PeriodTransitionBarProps {
  period: PayPeriodRow;
  role: PeriodViewerRole;
  allowPeriodReopen: boolean;
  /** The server's reopen wording. Rendered verbatim when present; ours is the fallback. */
  reopenNotice?: string | null;
  todayLocalDate: string;
  mockCase?: HrFixtureCase;
  onTransitioned: () => void;
}

export function PeriodTransitionBar({
  period,
  role,
  allowPeriodReopen,
  reopenNotice,
  todayLocalDate,
  mockCase,
  onTransitioned,
}: PeriodTransitionBarProps) {
  const [busyTo, setBusyTo] = useState<PayPeriodState | null>(null);
  const [reasonFor, setReasonFor] = useState<PeriodActionOffer | null>(null);
  /** The server's own `notice`, rendered verbatim. Never paraphrased away. */
  const [serverNotice, setServerNotice] = useState<string | null>(null);
  /**
   * What the transition's envelope reported it DID — instances opened, rows opened, disputes
   * carried. Rendered on the page, not only in a toast: a toast disappears, and "how many people
   * were actually asked to attest" is the fact somebody comes back to this page to check.
   */
  const [envelopeLines, setEnvelopeLines] = useState<string[]>([]);

  const offers = offeredTransitions({ period, role, allowPeriodReopen, todayLocalDate });

  const run = async (offer: PeriodActionOffer, reason: string | null) => {
    setBusyTo(offer.to);
    setEnvelopeLines([]);
    try {
      const result = await transitionPayPeriod(period.id, offer.to, reason, { mockCase });
      // The server's sentence wins over ours in every case where it sent one.
      setServerNotice(result.notice ?? null);

      /*
       * 🚨 WHAT ACTUALLY HAPPENED, not just that it happened.
       *
       * On `submitted` the transition opens one `timecard_attestation` instance per included
       * employment, and `workflowInstancesOpened` is that count. It is reported because "the period
       * is submitted" and "312 people have actually been asked to attest" are DIFFERENT FACTS —
       * only the second means the attestation deadline has started running for anybody, and a
       * period that moved without opening a single instance is a silent dead end that looks like
       * success. Reporting zero explicitly is the point: it is the case worth noticing.
       */
      const lines: string[] = [];
      if (typeof result.workflowInstancesOpened === "number") {
        const n = result.workflowInstancesOpened;
        lines.push(
          n === 0
            ? "No attestation instances were started — nobody has been asked to attest yet."
            : `${n} ${result.workflowFlowKey ?? "workflow"} ${n === 1 ? "instance" : "instances"} started.`,
        );
      }
      if (typeof result.rowsOpened === "number" && result.rowsOpened > 0) {
        lines.push(
          `${result.rowsOpened} timecard ${result.rowsOpened === 1 ? "row" : "rows"} opened.`,
        );
      }
      const disputes = disputeSentence(result.disputesOpen);
      if (disputes) lines.push(disputes);

      setEnvelopeLines(lines);
      toast.success(
        `Period ${offer.to}`,
        lines.length > 0 ? { description: lines.join(" ") } : undefined,
      );
      onTransitioned();
    } catch (err: unknown) {
      if (err instanceof HrRpcError) {
        // Verbatim. A refusal that does not name what was missing is how over-tightening hides.
        toast.error(err.userMessage);
      } else {
        toast.error(err instanceof Error ? err.message : "The transition did not go through.");
      }
    } finally {
      setBusyTo(null);
    }
  };

  const onClick = async (offer: PeriodActionOffer) => {
    if (offer.reasonRequired) {
      setReasonFor(offer);
      return;
    }
    const ok = await confirm({
      title: offer.label,
      description: offer.consequence,
      confirmLabel: offer.label,
      variant: offer.destructiveTone ? "destructive" : "default",
    });
    if (ok) await run(offer, null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {offers.map((offer) => {
          const blocked = offer.unavailableBecause !== null;
          const isBusy = busyTo === offer.to;
          return (
            <div key={offer.to} className="flex flex-col gap-1">
              <Button
                type="button"
                size="sm"
                // ≥44px touch target on an approve control (UI-IA §7 responsive floor).
                className="min-h-[44px]"
                variant={offer.destructiveTone ? "outline" : "default"}
                disabled={blocked || isBusy}
                onClick={() => void onClick(offer)}
              >
                {isBusy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
                ) : offer.to === "locked" ? (
                  <Lock className="mr-1.5 h-4 w-4" aria-hidden />
                ) : offer.to === "reopened" ? (
                  <Undo2 className="mr-1.5 h-4 w-4" aria-hidden />
                ) : null}
                {offer.label}
              </Button>
              {blocked ? (
                // 🚨 Never a bare disabled button. The reason is the point.
                <p className="max-w-[22rem] text-[11px] leading-snug text-muted-foreground">
                  {offer.unavailableBecause}
                </p>
              ) : null}
            </div>
          );
        })}
        {offers.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            {period.state === "closed"
              ? "This period is closed. Nothing further happens to it."
              : "No state change is available to you for this period."}
          </p>
        ) : null}
      </div>

      {envelopeLines.length > 0 ? (
        <ul className="space-y-1 rounded-md border border-border bg-muted/50 px-3 py-2">
          {envelopeLines.map((line) => (
            <li key={line} className="text-[12px] leading-relaxed text-foreground">
              {line}
            </li>
          ))}
        </ul>
      ) : null}

      {serverNotice ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-800 dark:text-amber-300">
          {serverNotice}
        </p>
      ) : null}

      {reasonFor ? (
        <TextInputDialog
          open
          onOpenChange={(open) => {
            if (!open) setReasonFor(null);
          }}
          title={reasonFor.label}
          // The reopen notice, in plain words, BEFORE the reason is typed.
          description={
            reasonFor.to === "reopened"
              ? // 🚨 The server's sentence wins. Both say the same thing; having ONE authority for
                // the wording is what stops the two drifting apart.
                (reopenNotice ?? REOPEN_NOTICE)
              : reasonFor.consequence
          }
          multiline
          rows={3}
          placeholder="Why is this period being reopened?"
          confirmLabel={reasonFor.label}
          busy={busyTo !== null}
          validate={(value) =>
            value.trim().length < 8
              ? "Say why in a sentence — this reason is part of the period's permanent record."
              : null
          }
          onConfirm={async (value) => {
            const offer = reasonFor;
            setReasonFor(null);
            await run(offer, value.trim());
          }}
        />
      ) : null}
    </div>
  );
}
