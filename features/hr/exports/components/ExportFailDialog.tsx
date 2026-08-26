"use client";

/**
 * ExportFailDialog — E-25 `generated|sent → failed`.
 *
 * 🚨 FAILURE IS RECORDED, NOT SWALLOWED (§4.5). The reason typed here becomes part of the export's
 * permanent record and is what the retry door on the failed row shows the next person. "It didn't
 * work" a month later, with nothing written down, is how a period gets exported twice by someone
 * who could not tell whether the first attempt landed.
 *
 * Multiline on purpose: a real rejection reason from a payroll portal is a sentence, sometimes
 * with a code in it, and truncating it to a single line loses the part that identifies the fix.
 */

import { useState } from "react";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";

export function ExportFailDialog({
  open,
  onOpenChange,
  exportVersion,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exportVersion: number;
  onConfirm: (failureReason: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <TextInputDialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
      title={`Record a failure for version ${exportVersion}`}
      description={
        <>
          <p>
            What went wrong? Write what the payroll system actually said — the
            rejection message, the code, the person who told you.
          </p>
          <p className="mt-2">
            This is kept with the export permanently. Marking it failed does not
            delete the file or change any hours; it records that this attempt
            did not land, so the next person can see that and does not send the
            same period twice.
          </p>
        </>
      }
      multiline
      rows={4}
      placeholder="e.g. portal rejected the batch: EIN mismatch"
      confirmLabel="Record failure"
      busy={busy}
      validate={(value) =>
        value.trim().length < 4
          ? "Write what actually went wrong — a few words is not enough to act on later."
          : null
      }
      onConfirm={async (value) => {
        setBusy(true);
        try {
          await onConfirm(value.trim());
          onOpenChange(false);
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
