/**
 * features/hr/time/kiosk/KioskPinPad.tsx — the numeric PIN pad (L3-67, §3.3, UI-IA §5.6).
 *
 * 🚨 **THERE IS NO EMPLOYEE LIST, ANYWHERE ON THE KIOSK. A LIST IS A ROSTER DISCLOSURE.** No names,
 * no photos, no "recent users", no autocomplete, no last-employee-shown. The PIN is the entire
 * identification, and the only name this device ever renders is the punching employee's, once, on
 * their own confirmation card.
 *
 * 🚨 **THE PIN IS NEVER ECHOED.** Digits render as filled dots. A wall tablet is watched — by a
 * queue, by a camera, by whoever is next — and a visible PIN on a shared screen is a shared PIN.
 *
 * 🚨 **BIG TARGETS, HIGH CONTRAST, LANDSCAPE AND PORTRAIT.** The keys are far above the 44px floor
 * because this is used with cold hands, wet hands, gloves, and at arm's length.
 *
 * `pinLength` is the knob `kiosk_pin_length`, from the device's own session config — never a 4 in
 * this file.
 */

"use client";

import { Delete, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export interface KioskPinPadProps {
  pin: string;
  pinLength: number;
  busy: boolean;
  /** The action this PIN will perform, named on screen so nobody punches the wrong thing blind. */
  actionLabel: string;
  onChange: (next: string) => void;
  onCancel: () => void;
}

export function KioskPinPad({
  pin,
  pinLength,
  busy,
  actionLabel,
  onChange,
  onCancel,
}: KioskPinPadProps) {
  function press(digit: string) {
    if (busy || pin.length >= pinLength) return;
    onChange(pin + digit);
  }

  return (
    <section className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-3xl font-semibold text-foreground">{actionLabel}</h1>
        <p className="text-lg text-muted-foreground">Enter your PIN</p>
      </div>

      {/* Masked. The digits are never rendered. */}
      <div className="flex items-center gap-4" aria-label="PIN entry progress">
        {Array.from({ length: pinLength }, (_, index) => (
          <span
            key={index}
            className={
              index < pin.length
                ? "size-5 rounded-full bg-foreground"
                : "size-5 rounded-full border-2 border-border"
            }
          />
        ))}
      </div>

      {busy && (
        <p className="flex items-center gap-2 text-lg text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          Recording…
        </p>
      )}

      <div className="grid grid-cols-3 gap-4">
        {KEYS.map((digit) => (
          <Button
            key={digit}
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => press(digit)}
            className="size-24 text-3xl font-semibold tabular-nums"
          >
            {digit}
          </Button>
        ))}

        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={onCancel}
          className="size-24 text-lg"
        >
          Cancel
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => press("0")}
          className="size-24 text-3xl font-semibold tabular-nums"
        >
          0
        </Button>

        <Button
          type="button"
          variant="ghost"
          disabled={busy || pin.length === 0}
          aria-label="Delete last digit"
          onClick={() => onChange(pin.slice(0, -1))}
          className="size-24"
        >
          <Delete className="size-8" />
        </Button>
      </div>
    </section>
  );
}
