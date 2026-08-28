/**
 * features/hr/time/kiosk/KioskPinResetPad.tsx — replacing a temporary PIN, at the tablet.
 *
 * 🚨 **THIS IS THE ONLY PLACE THIS PERSON CAN DO IT.** An HR writer sets a PIN for somebody whose
 * only surface is the wall tablet; that PIN is flagged `must_reset`. If the reset lived behind a
 * login, the population it exists for could never reach it and the "temporary" PIN would be
 * permanent — which is exactly what was happening before `hr_kiosk_pin_reset` existed.
 *
 * 🚨 **THE PERSON HERE IS ALREADY AUTHENTICATED.** They typed their employee number and the
 * temporary PIN moments ago and `hr_kiosk_session_open` accepted both, binding this session to
 * them. The session token is the proof — the door reads the employment FROM the session and never
 * from an argument, so this screen cannot reset anybody else's PIN even if it tried.
 *
 * 🚨 **TYPED TWICE, MASKED, NEVER HELD.** The value cannot be read back afterwards, so a single
 * mistyped field would lock this person out of the only clock they have. Both entries are masked,
 * and neither survives this component: on submit they are handed over and cleared in the same tick.
 */

"use client";

import { useState } from "react";

import { KioskNumericKeypad, KioskPinDots } from "./KioskNumericKeypad";

export interface KioskPinResetPadProps {
  employeeName: string | null;
  pinLength: number;
  busy: boolean;
  /** The server's sentence when a reset was refused — rendered verbatim, never re-worded. */
  refusal: string | null;
  onSubmit: (newPin: string) => void;
  onCancel: () => void;
}

export function KioskPinResetPad({
  employeeName,
  pinLength,
  busy,
  refusal,
  onSubmit,
  onCancel,
}: KioskPinResetPadProps) {
  const [step, setStep] = useState<"new" | "confirm">("new");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);

  const value = step === "new" ? next : confirm;

  function press(digit: string) {
    if (busy) return;
    setMismatch(false);

    if (step === "new") {
      const updated = next + digit;
      if (updated.length > pinLength) return;
      setNext(updated);
      if (updated.length === pinLength) setStep("confirm");
      return;
    }

    const updated = confirm + digit;
    if (updated.length > pinLength) return;
    setConfirm(updated);
    if (updated.length < pinLength) return;

    // Complete. Compare, then clear both in the same tick — neither value lingers in state while a
    // request is in flight, and both are gone from the screen before the answer arrives.
    if (updated === next) {
      setNext("");
      setConfirm("");
      setStep("new");
      onSubmit(updated);
      return;
    }
    setNext("");
    setConfirm("");
    setStep("new");
    setMismatch(true);
  }

  function back() {
    if (busy) return;
    setMismatch(false);
    if (step === "confirm") {
      if (confirm.length === 0) {
        // Backing off an empty confirmation returns to the first entry rather than stranding them.
        setStep("new");
        setNext("");
        return;
      }
      setConfirm((current) => current.slice(0, -1));
      return;
    }
    setNext((current) => current.slice(0, -1));
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-3xl font-semibold text-foreground">
          {employeeName ? `Hello, ${employeeName}` : "Choose your PIN"}
        </p>
        <p className="max-w-lg text-xl text-muted-foreground">
          {step === "new"
            ? "The PIN you were given is temporary. Choose a new one you will remember."
            : "Type it once more."}
        </p>
      </div>

      <KioskPinDots filled={value.length} length={pinLength} />

      {mismatch && (
        <p className="text-xl text-foreground">Those did not match. Start again.</p>
      )}

      {/* The server's own sentence — "Choose a PIN different from the one you were given." */}
      {refusal && !mismatch && <p className="max-w-lg text-center text-xl text-foreground">{refusal}</p>}

      <KioskNumericKeypad
        busy={busy}
        canDelete={value.length > 0 || step === "confirm"}
        onPress={press}
        onDelete={back}
        onCancel={onCancel}
      />
    </div>
  );
}
