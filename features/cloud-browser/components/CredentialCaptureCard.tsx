"use client";

/**
 * On-the-fly credential CAPTURE card (D-11) for the Cloud Browser surface.
 *
 * The agent hit a login it has NO stored credential for and called
 * `credential_login action="capture"`. Rather than ask the person to type the
 * password where the agent would see it, the aidream executor raises a handoff
 * carrying the card's SPEC (`browser.handoff.metadata.capture_request`) and
 * THIS card collects the values — pre-labelled from the agent's field map.
 *
 * 🚨 THE LEAK BOUNDARY IS THIS COMPONENT. The typed values live only in local
 * state and travel DIRECTLY to the vault via `submitCredentialCapture`
 * (POST /api/vault/browser-login/capture). They never enter Redux, a toast, a
 * log, the control plane, or anything the agent can read — the receipt carries
 * a status and the new item id, nothing else. On unmount they are dropped.
 *
 * The peer implementation is matrx-extend's `AgentCaptureCredentialCard`; the
 * request/response shapes and the expiry semantics are deliberately identical.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";

import { recordCaptureOutcome, submitCredentialCapture } from "../service";
import type { CredentialCaptureRequest } from "../types";

export interface CredentialCaptureCardProps {
  runId: string;
  profileId: string;
  request: CredentialCaptureRequest;
  /** Re-read the run so the retired card disappears. */
  onSettled: () => void;
}

export function CredentialCaptureCard({
  runId,
  profileId,
  request,
  onSettled,
}: CredentialCaptureCardProps) {
  // The person's typed values. Local state ONLY — see the leak boundary above.
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Already dead at mount (a page re-open long after the agent moved on) is
  // initial state, not an effect — the timer below only handles the deadline
  // passing while the card is on screen. One card per handoff (`key`).
  const [expired, setExpired] = useState(
    () => Date.now() >= new Date(request.expiresAt).getTime(),
  );
  // Live mirror of `busy` for the expiry timer, whose closure would read a
  // stale value. A write already in flight OWNS the outcome.
  const busyRef = useRef(false);

  // Drop the typed values when the card unmounts (tab switch, submit, cancel).
  useEffect(() => () => setValues({}), []);

  // Past `expiresAt` the handoff episode is dead: a Save then would land a
  // credential the agent has already given up on. Expire the card instead.
  useEffect(() => {
    const ms = new Date(request.expiresAt).getTime() - Date.now();
    if (ms <= 0) return;
    const timer = setTimeout(() => {
      setExpired(true);
      if (busyRef.current) return; // the in-flight write owns the outcome
      setValues({});
      void recordCaptureOutcome({
        runId,
        handoffId: request.handoffId,
        status: "expired",
      })
        .then(onSettled)
        .catch(() => undefined);
    }, ms);
    return () => clearTimeout(timer);
  }, [onSettled, request.expiresAt, request.handoffId, runId]);

  const allFilled = request.fields.every(
    (field) => (values[field.fieldKey] ?? "").length > 0,
  );

  const onCancel = useCallback(async () => {
    setValues({});
    setBusy(true);
    try {
      await recordCaptureOutcome({
        runId,
        handoffId: request.handoffId,
        status: expired ? "expired" : "cancelled",
      });
      onSettled();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not close this sign-in request.",
      );
    } finally {
      setBusy(false);
    }
  }, [expired, onSettled, request.handoffId, runId]);

  const onSave = useCallback(async () => {
    if (busy) return;
    // Hard guard: never write past the deadline, even if a throttled timer left
    // the button enabled for a moment.
    if (expired || Date.now() >= new Date(request.expiresAt).getTime()) {
      setExpired(true);
      setValues({});
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await submitCredentialCapture({ runId, profileId, request, values });
      // Drop the plaintext the instant the write returns.
      setValues({});
      toast.success("Saved to your vault.", {
        description: "Your agent can sign in now without ever seeing it.",
      });
      onSettled();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save this sign-in. Try again or cancel.",
      );
    } finally {
      // Never keep plaintext after a failed write either — the person retypes.
      setValues({});
      busyRef.current = false;
      setBusy(false);
    }
  }, [busy, expired, onSettled, profileId, request, runId, values]);

  return (
    <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 shrink-0 text-amber-500" />
        <p className="text-sm font-medium text-foreground">
          Save a login for {request.host}
        </p>
        {request.branch === "known" ? (
          <Badge variant="secondary" className="ml-auto gap-1">
            <ShieldCheck className="h-3 w-3" /> Known site
          </Badge>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Your agent needs to sign in to{" "}
        <span className="font-medium text-foreground">
          {request.displayName}
        </span>{" "}
        but has no saved sign-in. Enter it here — it goes straight to your vault
        and <span className="font-medium text-foreground">the agent never
        sees it</span>.
      </p>

      <div className="grid gap-2">
        {request.fields.map((field) => {
          const inputId = `cb-capture-${request.handoffId}-${field.fieldKey}`;
          return (
            <div key={field.fieldKey} className="grid gap-1">
              <Label htmlFor={inputId} className="text-xs">
                {field.label}
              </Label>
              <Input
                id={inputId}
                type={field.secret ? "password" : "text"}
                autoComplete={field.secret ? "new-password" : "off"}
                value={values[field.fieldKey] ?? ""}
                disabled={busy || expired}
                // 16px+ so iOS never zooms the page on focus.
                className="text-base"
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    [field.fieldKey]: event.target.value,
                  }))
                }
              />
            </div>
          );
        })}
      </div>

      {expired ? (
        <p className="text-xs text-muted-foreground">
          This request expired and your agent has moved on. Ask it to try the
          sign-in again.
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void onCancel()}
        >
          {expired ? "Dismiss" : "Cancel"}
        </Button>
        <Button
          size="sm"
          disabled={busy || expired || !allFilled}
          onClick={() => void onSave()}
        >
          {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
          Save and continue
        </Button>
      </div>
    </div>
  );
}

export default CredentialCaptureCard;
