"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";

interface IncompleteNoteProps {
  /** The short label ("Ending may be cut off"). */
  label: string;
  /** The reason-specific sentence, shown under Details. */
  detail?: string;
}

/**
 * The quiet mark on an answer that was delivered and kept but whose end may be
 * missing (recitation stop, length limit). Live (from the stream warning) and
 * after a reload (from the saved finish reason) both render THIS component, so
 * the two never look different. A state marker — not an error, no Retry.
 */
export function IncompleteNote({ label, detail }: IncompleteNoteProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1 text-xs" data-testid="incomplete-note">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {label}
        </span>
        {detail && (
          <Button variant="link" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide details" : "Details"}
          </Button>
        )}
      </div>
      {detail && open && (
        <div className="mt-1 rounded bg-amber-500/10 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
          {detail}
        </div>
      )}
    </div>
  );
}
