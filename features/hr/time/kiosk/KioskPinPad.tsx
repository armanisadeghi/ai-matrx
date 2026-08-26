/**
 * features/hr/time/kiosk/KioskPinPad.tsx — the numeric PIN pad (L3-67, SPEC-TIME §3.3).
 *
 * 🚨 **NO EMPLOYEE LIST, ANYWHERE, EVER.** Not a picker, not an autocomplete, not a "recent" row,
 * not a hint. *A list is a roster disclosure* — a break-room tablet showing who works here is a
 * staff directory anyone walking past can read, and it makes buddy-punching a matter of guessing
 * four digits against a name you were handed. Identity on the kiosk is the PIN and nothing else.
 *
 * 🚨 **The pad is numeric-only and rendered as buttons**, not an `<input>`: a text field on a wall
 * tablet raises the OS keyboard, which covers the pad, offers autofill, and remembers what was
 * typed. None of those are acceptable for a shared credential.
 *
 * 🚨 **`pinLength` is the server's knob** (`session.config.pinLength`), never a constant here, and
 * the pad submits the moment it is reached — the act was already chosen, so there is nothing left
 * to confirm and one fewer tap is one less second of a PIN sitting on a screen in a break room.
 *
 * The entered digits are masked. The kiosk never renders a PIN, not even the one being typed.
 */

"use client";

import { useEffect, useState } from "react";
import { Delete, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PunchKind } from "@/features/hr/time/api/types";
import { punchKindPresentation } from "@/features/hr/time/clock/punchVocabulary";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export interface KioskPinPadProps {
  punchKind: PunchKind;
  pinLength: number;
  busy: boolean;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
}

export function KioskPinPad({
  punchKind,
  pinLength,
  busy,
  onSubmit,
  onCancel,
}: KioskPinPadProps) {
  const [pin, setPin] = useState("");
  const presentation = punchKindPresentation(punchKind);

  // Submit on completion, then clear immediately: the digits do not linger in state while the
  // request is in flight, and they are gone from the screen before the confirmation arrives.
  useEffect(() => {
    if (pin.length < pinLength) return;
    const entered = pin;
    setPin("");
    onSubmit(entered);
  }, [pin, pinLength, onSubmit]);

  function press(digit: string) {
    if (busy) return;
    setPin((current) => (current.length >= pinLength ? current : current + digit));
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        <p className="text-3xl font-semibold text-foreground">{presentation.label}</p>
        <p className="text-xl text-muted-foreground">Enter your PIN</p>
      </div>

      {/* Masked, always. The count is the only feedback — the digits are never drawn. */}
      <div className="flex items-center gap-4" aria-label={`${pin.length} of ${pinLength} digits entered`}>
        {Array.from({ length: pinLength }, (_, index) => (
          <span
            key={index}
            className={`size-5 rounded-full border-2 border-border ${
              index < pin.length ? "bg-foreground" : "bg-transparent"
            }`}
          />
        ))}
      </div>

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
          disabled={busy}
          onClick={() => setPin((current) => current.slice(0, -1))}
          aria-label="Delete last digit"
          className="size-24"
        >
          <Delete className="size-9" />
        </Button>
      </div>
    </div>
  );
}
