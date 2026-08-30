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
 * 🚨 **The PIN step is numeric-only and rendered as buttons**, not an `<input>`: a text field on a
 * wall tablet raises the OS keyboard, which covers the pad, offers autofill, and remembers what was
 * typed. None of those are acceptable for a shared **credential**. The employee-number step is a
 * field precisely because a badge number is not one — see the note below.
 *
 * 🚨 **`pinLength` is the server's knob** (`session.config.pinLength`), never a constant here.
 *
 * 🚨 **THE EMPLOYEE NUMBER IS NOT NECESSARILY NUMERIC, AND THIS WAS FOUND BY TESTING, NOT BY
 * READING.** The spec says *"numeric pad asks EMPLOYEE NUMBER, then PIN"*, and the first real
 * employer's numbers are `EMP-00001`. `hr_kiosk_session_open` matches `employee_number` exactly, so
 * a digits-only pad could never enter one — it would have locked out every employer that does not
 * number its people in bare digits. The number step therefore takes a **text field** (it is an
 * identifier read off a badge, not a secret), and the **PIN keeps the numeric pad**, where the
 * no-OS-keyboard rule genuinely matters.
 *
 * The PIN is masked. The kiosk never renders a PIN, not even the one being typed. The employee
 * number is shown, because it is an identifier the person is reading off a badge, not a secret.
 */

"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";

import { KioskNumericKeypad, KioskPinDots } from "./KioskNumericKeypad";
import type { PunchKind } from "@/features/hr/time/api/types";
import { punchKindPresentation } from "@/features/hr/time/clock/punchVocabulary";

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
          hiding it only makes it harder to correct a typo. It is never checked as it is typed, and
          the field never hints whether the number exists.
        */
        <Input
          value={employeeNumber}
          onChange={(event) => setEmployeeNumber(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && employeeNumber.trim()) setStep("pin");
          }}
          disabled={busy}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-label="Employee number"
          placeholder="EMP-00001"
          className="min-h-[72px] w-full max-w-md text-center text-3xl tracking-widest"
        />
      ) : (
        /* Masked, always. The count is the only feedback — the digits are never drawn. */
        <KioskPinDots filled={pin.length} length={pinLength} />
      )}

      {step === "pin" && (
        <KioskNumericKeypad
          busy={busy}
          canDelete={value.length > 0}
          onPress={press}
          onDelete={back}
          onCancel={onCancel}
        />
      )}

      {step === "number" && (
        <div className="flex w-full max-w-md flex-col gap-3">
          <Button
            type="button"
            disabled={busy || employeeNumber.trim().length === 0}
            onClick={() => setStep("pin")}
            className="min-h-[72px] gap-2 text-xl"
          >
            Next
            <ArrowRight className="size-5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={onCancel}
            className="min-h-[60px] text-lg"
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
