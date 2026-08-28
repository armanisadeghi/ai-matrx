/**
 * features/hr/time/kiosk/KioskNumericKeypad.tsx — the tablet's number pad and the masked dots.
 *
 * Extracted so the identify flow (`KioskPinPad`) and the forced-reset flow (`KioskPinResetPad`)
 * share ONE implementation of the things that must not drift between them: the digits are buttons
 * rather than an `<input>` (a text field on a wall tablet raises the OS keyboard, which covers the
 * pad, offers autofill, and remembers what was typed — none of which is acceptable for a shared
 * credential), and the entry is **masked, always**. The count is the only feedback; the digits are
 * never drawn.
 *
 * A second copy of this markup would eventually mask on one screen and not the other, and it would
 * be the reset screen — the one nobody demos — that lost it.
 */

"use client";

import { Delete, X } from "lucide-react";

import { Button } from "@/components/ui/button";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** Masked progress. `length` is the server's `pinLength` knob, never a constant. */
export function KioskPinDots({ filled, length }: { filled: number; length: number }) {
  return (
    <div
      className="flex min-h-12 items-center gap-4"
      aria-label={`${filled} of ${length} digits entered`}
    >
      {Array.from({ length }, (_, index) => (
        <span
          key={index}
          className={`size-5 rounded-full border-2 border-border ${
            index < filled ? "bg-foreground" : "bg-transparent"
          }`}
        />
      ))}
    </div>
  );
}

export function KioskNumericKeypad({
  busy,
  canDelete,
  onPress,
  onDelete,
  onCancel,
}: {
  busy: boolean;
  canDelete: boolean;
  onPress: (digit: string) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {KEYS.map((digit) => (
        <Button
          key={digit}
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => onPress(digit)}
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
        onClick={() => onPress("0")}
        className="size-24 text-4xl font-semibold tabular-nums"
      >
        0
      </Button>
      <Button
        type="button"
        variant="ghost"
        disabled={busy || !canDelete}
        onClick={onDelete}
        aria-label="Delete last digit"
        className="size-24"
      >
        <Delete className="size-9" />
      </Button>
    </div>
  );
}
