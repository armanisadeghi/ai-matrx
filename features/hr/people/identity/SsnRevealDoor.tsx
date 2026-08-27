"use client";

// features/hr/people/identity/SsnRevealDoor.tsx
//
// The break-glass door for a stored SSN (SPEC-EMPLOYEES §1.3, SPEC-ACCESS §4.5).
//
// 🚨 LAST FOUR BY DEFAULT, FOR EVERY VIEWER — HR INCLUDED. There is no viewer for
// whom the full number is the resting state. The identity panel renders `ssn_last4`
// and nothing else; the full value exists only inside this dialog, only after a
// person typed a reason, and only until they close it.
//
// 🚨 THE CONTROL IS ABSENT FOR ANYONE THE DOOR WOULD REFUSE (§4.2), not disabled.
// A disabled button tells a colleague that a number exists and that somebody else
// may read it; §1.3's rule is that a field you cannot access is not in the DOM.
// Who may ask is `profile.capabilities` and `profile.viewer` — both computed by the
// server, never inferred here from a role string. See `mayAsk` below for why it is
// two arms and not one.
//
// 🚨 THE HIDDEN CONTROL IS NOT THE SECURITY BOUNDARY. `hr.reveal_ssn` refuses and
// AUDITS the refusal regardless of what the client drew, which is why
// `revealSsn.ts` still handles a 403 it "cannot" receive.
//
// 🚨 NOTHING HERE PERSISTS THE VALUE. It lives in one `useState`, is cleared when
// the dialog closes, and is never sent to a toast — a toast outlives the dialog and
// can be read over a shoulder long after the person has moved on.

import { useState } from "react";
import { Loader2, ShieldQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useBackendApi } from "@/hooks/useBackendApi";
import { cn } from "@/lib/utils";

import { revealHrSsn, type HrSsnRevealOutcome } from "./revealSsn";

/** What this reveal is FOR. Audited, and deliberately not a constant per surface. */
const PURPOSE = "identity_panel";

export function SsnRevealDoor({
  employeeId,
  organizationId,
  capabilities,
  viewer,
  className,
}: {
  employeeId: string;
  organizationId: string;
  /** `profile.capabilities`, verbatim from the server. */
  capabilities: string[];
  /** `profile.viewer`. `self` is one of the two arms the door admits — see below. */
  viewer: string;
  className?: string;
}) {
  const api = useBackendApi();
  const [open, setOpen] = useState(false);
  const [justification, setJustification] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<HrSsnRevealOutcome | null>(null);

  // §4.2 — absent, not disabled.
  //
  // 🚨 THE CONTROL MIRRORS THE DOOR'S TWO ARMS, AND MUST KEEP MIRRORING THEM.
  // `hr.reveal_ssn` admits either somebody holding `ssn.reveal` over this person OR
  // **the subject themselves**:
  //
  //     if not (hr.capability(v_uid, 'ssn.reveal', v_subject)
  //             or (v_subject is not null and v_subject = any(hr.employments_of(v_uid))))
  //
  // Gating this control on the capability alone was stricter than the server, which
  // made the self lane unreachable: your own number is yours to see, the door was
  // written to allow it, and the audit row records it as `basis = 'self'`. A UI that
  // is quietly stricter than its door is how a shipped capability goes unused — the
  // exact shape of the defect this whole surface was built to close.
  const isSelf = viewer === "self";
  const mayAsk = capabilities.includes("ssn.reveal") || isSelf;
  if (!mayAsk) return null;

  const close = () => {
    setOpen(false);
    // 🚨 The value dies with the dialog. Not on a timer, not on a re-render —
    // deterministically, the moment it is closed.
    setOutcome(null);
    setJustification("");
    setBusy(false);
  };

  const submit = async () => {
    setBusy(true);
    const result = await revealHrSsn({
      request: api.fetch,
      employeeId,
      organizationId,
      purpose: PURPOSE,
      justification,
    });
    setBusy(false);
    setOutcome(result);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground",
          className,
        )}
      >
        <ShieldQuestion className="h-3.5 w-3.5" aria-hidden />
        Show the full number
      </button>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isSelf
                ? "Show your Social Security number"
                : "Show this person's Social Security number"}
            </DialogTitle>
            <DialogDescription>
              {isSelf
                ? "This is recorded in your own access log with the time and the reason you give below."
                : "This is recorded in their access log with your name, the time, and the reason you give below. They can see that you looked."}
            </DialogDescription>
          </DialogHeader>

          {outcome?.kind === "revealed" ? (
            <RevealedValue outcome={outcome} />
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="ssn-reveal-justification"
                  className="text-sm font-medium text-foreground"
                >
                  Why do you need it?
                </label>
                <Textarea
                  id="ssn-reveal-justification"
                  value={justification}
                  onChange={(event) => setJustification(event.target.value)}
                  placeholder="e.g. Filing the quarterly payroll return with the state."
                  rows={3}
                  disabled={busy}
                />
              </div>
              {outcome ? <RefusalLine outcome={outcome} isSelf={isSelf} /> : null}
            </div>
          )}

          <DialogFooter>
            {outcome?.kind === "revealed" ? (
              <Button type="button" onClick={close}>
                Done
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={close} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void submit()}
                  // The server owns the length floor (it is a knob); this only stops
                  // an empty submission, which the door would refuse anyway.
                  disabled={busy || !justification.trim()}
                >
                  {busy ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Checking…
                    </>
                  ) : (
                    "Show the number"
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RevealedValue({
  outcome,
}: {
  outcome: Extract<HrSsnRevealOutcome, { kind: "revealed" }>;
}) {
  return (
    <div className="space-y-2">
      <div className="rounded-md border border-border bg-muted/40 p-3">
        <p className="font-mono text-lg tracking-wider text-foreground">{outcome.ssn}</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Shown once. Closing this returns the record to the last four digits — it is
        not kept anywhere on this device.
      </p>
    </div>
  );
}

/**
 * The non-value outcomes, each said as the thing it actually is.
 *
 * 🚨 `not_stored` IS NOT A FAILURE. The reveal was authorized and the audit row was
 * written; there is simply no number on file — which is the normal, correct state
 * for a contractor who supplied only a W-9. Rendering it as an error would send an
 * HR admin looking for a bug that is not there.
 */
function RefusalLine({
  outcome,
  isSelf,
}: {
  outcome: HrSsnRevealOutcome;
  isSelf: boolean;
}) {
  if (outcome.kind === "revealed") return null;

  const text =
    outcome.kind === "not_stored"
      ? isSelf
        ? "There is no Social Security number on your record. Nothing was shown, and your request is in your access log."
        : "No Social Security number is on record for this person. Nothing was shown, and your request is in their access log."
      : outcome.kind === "denied"
        ? isSelf
          ? "You do not have permission to see this. The attempt is in your access log."
          : "You do not have permission to see this person's Social Security number. The attempt is in their access log."
        : outcome.kind === "justification_too_short"
          ? outcome.minChars !== null
            ? `Say a little more — at least ${outcome.minChars} characters${
                outcome.suppliedChars !== null ? `, and you gave ${outcome.suppliedChars}` : ""
              }.`
            : "Say a little more about why you need this."
          : outcome.message;

  return (
    <p
      className={cn(
        "text-sm",
        outcome.kind === "not_stored" ? "text-muted-foreground" : "text-destructive",
      )}
    >
      {text}
    </p>
  );
}
