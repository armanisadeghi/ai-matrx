/**
 * features/hr/time/kiosk/KioskPinPad.tsx — the numeric pad (L3-67, SPEC-TIME §1.2, §3.3).
 *
 * 🚨 **IT ASKS FOR THE EMPLOYEE NUMBER, THEN THE PIN — AND THAT IS NOT A UX PREFERENCE (R2).**
 * *"A PIN alone identifies nobody"* (§1.2): it is a secret, not an identifier, and two employees may
 * hold the same four digits. `hr_kiosk_session_open(p_session_token, p_employee_number,
 * p_employment_pin)` is the door, and it takes both. This pad used to collect four digits and hand
 * them to `hr_kiosk_punch`, which cannot resolve a person from a PIN — so the flow could not have
 * worked for anybody.
 *
 * 🚨 **NO EMPLOYEE LIST, ANYWHERE, EVER.** Not a picker, not an autocomplete, not a "recent" row,
 * not a hint, and — now that a number is typed — **no validation that says whether it exists**. *A
 * list is a roster disclosure*, and so is a pad that goes green on a real employee number. The
 * server answers one indistinguishable failure for a wrong number and a wrong PIN; this screen must
 * not be more helpful than that.
 *
 * 🚨 **The pad is numeric-only and rendered as buttons**, not an `<input>`: a text field on a wall
 * tablet raises the OS keyboard, which covers the pad, offers autofill, and remembers what was
 * typed. None of those are acceptable for a shared credential.
 *
 * 🚨 **`pinLength` is the server's knob** (`session.config.pinLength`), never a constant here. The
 * employee number has **no** length knob and no client-side format rule — an employer numbers its
 * people however it likes, and a pad that assumed four digits would lock out everyone else.
 *
 * The PIN is masked. The kiosk never renders a PIN, not even the one being typed. The employee
 * number is shown, because it is an identifier the person is reading off a badge, not a secret.
 */

"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Delete, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PunchKind } from "@/features/hr/time/api/types";
import { punchKindPresentation } from "@/features/hr/time/clock/punchVocabulary";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export interface KioskPinPadProps {
  punchKind: PunchKind;
  pinLength: number;
  busy: boolean;
  onSubmit: (employeeNumber: string, pin: string) => void;
  onCancel: () => void;
}

export function KioskPinPad({
  punchKind,
  pinLength,
  busy,
  onSubmit,
  onCancel,
}: KioskPinPadProps) {
  const [step, setStep] = useState<"number" | "pin">("number");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [pin, setPin] = useState("");
  const presentation = punchKindPresentation(punchKind);

  const value = step === "number" ? employeeNumber : pin;

  /*
   * Submit on completion, then clear immediately: neither the number nor the PIN lingers in state
   * while the request is in flight, and both are gone from the screen before the answer arrives.
   * Only the PIN step auto-submits — an employee number has no known length to complete.
   */
  useEffect(() => {
    if (step !== "pin" || pin.length < pinLength) return;
    const enteredNumber = employeeNumber;
    const enteredPin = pin;
    setPin("");
    setEmployeeNumber("");
    setStep("number");
    onSubmit(enteredNumber, enteredPin);
  }, [step, pin, pinLength, employeeNumber, onSubmit]);

  function press(digit: string) {
    if (busy) return;
    if (step === "number") {
      // No cap: an employer's numbering scheme is its own business.
      setEmployeeNumber((current) => current + digit);
      return;
    }
    setPin((current) => (current.length >= pinLength ? current : current + digit));
  }

  function back() {
    if (busy) return;
    if (step === "pin") {
      setPin((current) => current.slice(0, -1));
      return;
    }
    setEmployeeNumber((current) => current.slice(0, -1));
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        <p className="text-3xl font-semibold text-foreground">{presentation.label}</p>
        <p className="text-xl text-muted-foreground">
          {step === "number" ? "Enter your employee number" : "Enter your PIN"}
        </p>
      </div>

      {step === "number" ? (
        /*
          Shown, not masked — a badge number is an identifier the person is reading off a card, and
          hiding it only makes it harder to correct a typo. It is never checked as it is typed.
        */
        <p
          className="min-h-12 text-4xl font-semibold tabular-nums tracking-widest text-foreground"
          aria-label="Employee number"
        >
          {employeeNumber || <span className="text-muted-foreground">—</span>}
        </p>
      ) : (
        /* Masked, always. The count is the only feedback — the digits are never drawn. */
        <div
          className="flex min-h-12 items-center gap-4"
          aria-label={`${pin.length} of ${pinLength} digits entered`}
        >
          {Array.from({ length: pinLength }, (_, index) => (
            <span
              key={index}
              className={`size-5 rounded-full border-2 border-border ${
                index < pin.length ? "bg-foreground" : "bg-transparent"
              }`}
            />
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {KEYS.map((digit) => (
          <Button
            key={digit}
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => press(digit)}
            className="size-24 text-4xl font-semibold tabular-nums"
          >
            {digit}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={onCancel}
          aria-label="Cancel"
          className="size-24"
        >
          <X className="size-9" />
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => press("0")}
          className="size-24 text-4xl font-semibold tabular-nums"
        >
          0
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy || value.length === 0}
          onClick={back}
          aria-label="Delete last digit"
          className="size-24"
        >
          <Delete className="size-9" />
        </Button>
      </div>

      {step === "number" && (
        <Button
          type="button"
          disabled={busy || employeeNumber.length === 0}
          onClick={() => setStep("pin")}
          className="min-h-[72px] w-full max-w-md gap-2 text-xl"
        >
          Next
          <ArrowRight className="size-5" />
        </Button>
      )}
    </div>
  );
}
