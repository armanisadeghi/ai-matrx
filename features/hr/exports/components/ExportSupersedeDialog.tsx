"use client";

/**
 * ExportSupersedeDialog — E-26 `generated|failed → superseded`, which generates a NEW export at
 * version n+1 pointing back at this one.
 *
 * 🚨 THE DOUBLE-PAY RULE, IN THE USER'S OWN LANGUAGE. This dialog is the last place a person can
 * be told, in words they actually use, what supersede means and where its limit is:
 *
 *   - Replacing an export that has NOT been acknowledged is safe. Nothing has been paid from it.
 *   - Once an export has been acknowledged, payroll has taken the file. Replacing it then would
 *     mean the same hours are sitting in payroll twice, and people get paid twice.
 *
 * That is why an acknowledged row does not offer this dialog at all — its supersede control is
 * unavailable, with the reason stated on the row. This copy is the same promise said out loud at
 * the moment of the decision, not a legal note nobody reads.
 */

import { useState } from "react";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";

export function ExportSupersedeDialog({
  open,
  onOpenChange,
  exportVersion,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exportVersion: number;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <TextInputDialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
      title={`Replace version ${exportVersion} with a new file`}
      description={
        <>
          <p>
            This builds a fresh file as version {exportVersion + 1} and marks
            version {exportVersion} as replaced. Both files are kept — the old
            one stays as a record of what was nearly sent.
          </p>
          <p className="mt-2 font-medium text-foreground">
            This is safe because nobody has been paid from version{" "}
            {exportVersion} yet. If a file has already been acknowledged by your
            payroll system, it can never be replaced: the same hours would be
            sitting in payroll twice and people would be paid twice. In that
            case the fix is an adjustment that lands in the next export, tagged
            back to this period.
          </p>
          <p className="mt-2">Why are you replacing it?</p>
        </>
      }
      multiline
      rows={3}
      placeholder="e.g. two corrections landed after the file was built"
      confirmLabel="Build the replacement"
      busy={busy}
      validate={(value) =>
        value.trim().length < 4
          ? "Write the reason — it stays with both files as the record of why this happened."
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
