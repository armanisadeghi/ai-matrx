"use client";

/**
 * features/hr/time/timesheet/AttestationBar.tsx — L3-49. SPEC-TIME §2.2.
 *
 * 🚨 THE STATEMENT IS STORED AS SHOWN, AND THIS COMPONENT IS WHY THAT IS VISIBLE.
 * Before the decision it renders `attestation.statementToShow` — the org's current text. After the
 * decision it renders `attestation.statementShown` — **the exact words this person agreed to**. An
 * org that edits its attestation statement next quarter must not retroactively change what somebody
 * already signed, and a surface that always renders the current text would do exactly that, silently
 * and invisibly, which is the failure this two-field design exists to prevent.
 *
 * 🚨 ATTEST WITH EXCEPTION IS NOT A REJECTION. The employee agrees to submit and records that they
 * disagree with a figure. Their words become `dispute_note`, nothing can ever edit them, and from
 * that moment **both** the computed value and their stated value show side by side, permanently.
 *
 * 🚨 IT NEVER AUTO-ATTESTS. There is no default, no pre-checked box, and no "attest" that happens
 * because a deadline passed — the tick closes an undecided step as `not_attested` and tells the
 * manager (§2.2). A surface that makes not-deciding look like deciding is the wage claim.
 *
 * MOBILE FIRST (L3-77). Employees do this on a phone. The controls are `min-h-11` (44px) and stack
 * to one column below `sm`.
 */

import { useState } from "react";
import { CheckCircle2, FileWarning, Lock, PencilLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { HrRpcError } from "../api/rpc";
import type { Timesheet } from "../api/types";
import { formatDateTimeInTz, viewerTimeZone } from "../shared/format";
import { RefusalNotice } from "../shared/RefusalNotice";
import { attestTimecard } from "../shared/workflowApi";
import { RowStateChip } from "../shared/badges";
import type { HrFixtureCase } from "@/features/hr/mock/transport";

/** A reason of one character is not a reason (§4.1's validation, applied to the dispute note). */
const MIN_REASON_LENGTH = 2;

export function AttestationBar({
  timesheet,
  mockCase,
  onDecided,
  className,
}: {
  timesheet: Timesheet;
  mockCase?: HrFixtureCase;
  onDecided: () => void;
  className?: string;
}) {
  const { attestation, rowState } = timesheet;
  const [mode, setMode] = useState<"idle" | "exception">("idle");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<HrRpcError | Error | null>(null);

  const decided = attestation.attestedAt !== null;
  const locked = rowState === "locked" || rowState === "exported";

  async function submit(disputeNote?: string) {
    if (!attestation.stepId) return;
    setBusy(true);
    setError(null);
    try {
      await attestTimecard(attestation.stepId, { disputeNote }, { mockCase });
      toast.success(
        disputeNote
          ? "Submitted, and your note is on the record."
          : "Timesheet attested.",
      );
      setMode("idle");
      setNote("");
      onDecided();
    } catch (caught) {
      // Verbatim. The refusal names what happened — a closed window, a missing step.
      setError(caught instanceof Error ? caught : new Error(String(caught)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={cn("rounded-lg border border-border bg-card p-4", className)}
      aria-label="Attestation"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-sm font-semibold">Your confirmation</h2>
        <RowStateChip state={rowState} />
      </div>

      {/* THE STATEMENT. Which one depends entirely on whether a decision exists. */}
      {decided ? (
        <div className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3">
          <p className="flex items-start gap-2 text-sm">
            <CheckCircle2
              className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden
            />
            <span>
              <span className="block font-medium">
                You confirmed this on{" "}
                {formatDateTimeInTz(attestation.attestedAt, viewerTimeZone())}.
              </span>
              <span className="mt-1.5 block text-muted-foreground">
                What you agreed to, word for word:
              </span>
              {/* `statementShown`. NEVER `statementToShow`. */}
              <span className="mt-1 block italic">
                &ldquo;{attestation.statementShown ?? "The statement was not recorded."}&rdquo;
              </span>
            </span>
          </p>
        </div>
      ) : attestation.statementToShow ? (
        <p className="mt-3 rounded-md border border-border bg-muted/40 p-3 text-sm italic">
          &ldquo;{attestation.statementToShow}&rdquo;
        </p>
      ) : null}

      {locked ? (
        <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          This pay period is closed. If something here is wrong, ask for a correction — it will be
          paid in the next period and stays tagged to this one.
        </p>
      ) : null}

      <RefusalNotice error={error} className="mt-3" />

      {mode === "exception" ? (
        <div className="mt-3 space-y-2">
          <label htmlFor="hr-attest-exception" className="block text-sm font-medium">
            What is wrong? Say it in your own words.
          </label>
          <p className="text-xs text-muted-foreground">
            This is kept exactly as you write it. Nobody — not your manager, not HR — can edit or
            delete it, and it stays on the record after this timesheet is approved.
          </p>
          <Textarea
            id="hr-attest-exception"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
            placeholder="For example: Thursday shows 8 hours but I worked until 6."
            className="text-base"
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              className="min-h-11 sm:min-h-9"
              disabled={busy || note.trim().length < MIN_REASON_LENGTH}
              onClick={() => void submit(note.trim())}
            >
              Submit with my note
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 sm:min-h-9"
              disabled={busy}
              onClick={() => {
                setMode("idle");
                setNote("");
              }}
            >
              Back
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {attestation.canAttest && attestation.stepId ? (
            <>
              {/* ≥44px on a phone — L3-77 / UI-IA §7. */}
              <Button
                type="button"
                className="min-h-11 sm:min-h-9"
                disabled={busy}
                onClick={() => void submit()}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden />
                These hours are right
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 sm:min-h-9"
                disabled={busy}
                onClick={() => setMode("exception")}
              >
                <FileWarning className="mr-2 h-4 w-4" aria-hidden />
                Submit, but something is wrong
              </Button>
            </>
          ) : null}

          <Button
            type="button"
            variant="ghost"
            className="min-h-11 sm:min-h-9"
            onClick={() => void announceComingSoon("hr.timecard-correction-request")}
          >
            <PencilLine className="mr-2 h-4 w-4" aria-hidden />
            Ask for a correction
          </Button>
        </div>
      )}

      {!attestation.canAttest && !decided && !locked ? (
        <p className="mt-3 text-xs text-muted-foreground">
          There is nothing for you to confirm right now. Your manager or HR will let you know when
          this pay period is ready for you.
        </p>
      ) : null}
    </section>
  );
}
