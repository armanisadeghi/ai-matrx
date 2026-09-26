"use client";

/**
 * A WORKFLOW STEP whose change is held for a person — the same card the chat and
 * the table's page draw, under the same words (lane HELD-WRITE-TAILS,
 * 2026-09-26).
 *
 * A workflow's "Save Table Row" used to write through the store's own machinery
 * and never ask the organization's approval setting, so a run wrote into a table
 * the chat would have held. It now asks, and when a person must decide, the run
 * view says "Held for your approval: <what> on <table>" and offers Approve /
 * Refuse right here — never an error card, never "This step failed".
 *
 * The decision is the card's (`custom.work_approval_decide`), so approving here,
 * in the chat, or on the table's page is one decision on one queue row.
 */

import { Clock } from "lucide-react";

import { RecordChangeApprovalCard } from "./RecordChangeApprovalCard";
import {
  heldWriteHeadline,
  type RecordChangeWait,
} from "./recordChangeApproval";
import { useHeldWriteTableName } from "./useHeldWriteTableName";

export function HeldStepCard({
  wait,
  identity,
  stopped,
  paused = false,
  onDecided,
}: {
  wait: RecordChangeWait;
  /** The step's identity in the run (run id + invocation) — the card's key. */
  identity: string;
  /** True when the run stopped at this step because the change is held. */
  stopped: boolean;
  /**
   * True when the run is PAUSED at this step (lane HELD-WRITE-RESUME): deciding
   * carries the run on — approved, with the new row; refused, the run ends.
   */
  paused?: boolean;
  /** Told once the decision is taken — a paused run resumes from here. */
  onDecided?: () => void;
}) {
  const tableName = useHeldWriteTableName(wait);
  return (
    <div className="space-y-1.5" data-held-write-step>
      <div className="flex items-start gap-1.5">
        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="min-w-0 flex-1 text-xs font-medium text-amber-700 dark:text-amber-300">
          {heldWriteHeadline(wait, tableName)}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        {paused
          ? "Nothing was written yet, and the run is paused here. Approve it and the run carries on with the new row; refuse it and the run ends."
          : stopped
            ? "Nothing was written yet, so the steps after this one did not run. Approve it and the change lands in the table."
            : "Nothing was written yet. Approve it and the change lands."}
      </p>
      <RecordChangeApprovalCard
        wait={wait}
        callId={identity}
        {...(tableName ? { tableName } : {})}
        {...(onDecided ? { onDecided } : {})}
      />
    </div>
  );
}
