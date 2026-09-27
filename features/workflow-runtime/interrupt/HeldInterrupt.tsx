"use client";

/**
 * A run PAUSED on a held change — the approval card, and the run carries on
 * from the decision (lane HELD-WRITE-RESUME, 2026-09-26).
 *
 * A workflow step whose change waits for a person pauses the run the way a
 * Pause & Ask does. This is that pause's answer: the SAME approval card the
 * chat and the table's page draw. Deciding goes through the queue
 * (`custom.work_approval_decide`); the run is then resumed through the ordinary
 * `/runs/{id}/resume`, and the SERVER reads the decision — approved, it records
 * the new row as the step's output and the next steps run with its id;
 * refused, the run ends as refused. Nothing the page sends says what was
 * written, so this component sends no answer of its own.
 *
 * Decided somewhere else (the chat, the table's page)? The page FOLLOWS the
 * approval row and carries the run on by itself once it is no longer pending
 * (lane RUN-PAGE-TAILS, 2026-09-27) — approved, the run goes on with the new
 * row; refused, it ends. "If nothing happens, carry on here" stays as the
 * honest fallback: the same resume, and while the change is still waiting the
 * server says so. The organization is the RUN's, never the active one.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Play } from "lucide-react";

import { HeldStepCard } from "@/features/record-change-approvals/HeldStepCard";
import type { RecordChangeWait } from "@/features/record-change-approvals/recordChangeApproval";

import { useApprovalDecision } from "@/features/record-change-approvals/approvalDecision";

import { useWorkflowRunControls } from "../hooks/useWorkflowRunControls";
import { runOrganizationId } from "../runOrganization";

export function HeldInterrupt({
  runId,
  checkpointId,
  wait,
}: {
  runId: string;
  checkpointId: string;
  wait: RecordChangeWait;
}) {
  const { answerInterrupt } = useWorkflowRunControls();
  const [carrying, setCarrying] = useState<"idle" | "sending" | "sent">("idle");
  // One resume per decision: the card's own Approve/Refuse and the followed
  // row can both see the same decision, and only the first carries the run on.
  const carried = useRef(false);

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void runOrganizationId(runId).then((id) => {
      if (live) setOrganizationId(id);
    });
    return () => {
      live = false;
    };
  }, [runId]);
  const approvalState = useApprovalDecision(
    carrying === "idle" ? organizationId : null,
    wait.approvalId ?? null,
  );

  const carryOn = useCallback(async () => {
    carried.current = true;
    setCarrying("sending");
    // The server derives the step's output from the approval; the value sent
    // here is ignored for a held step, so it is empty on purpose.
    const ok = await answerInterrupt(runId, checkpointId, {});
    // Refused (e.g. still waiting): the page keeps following and the fallback returns.
    carried.current = ok;
    setCarrying(ok ? "sent" : "idle");
  }, [answerInterrupt, runId, checkpointId]);

  // DECIDED SOMEWHERE ELSE — carry on without being asked.
  useEffect(() => {
    if (!approvalState || approvalState === "pending" || carried.current) return;
    void carryOn();
  }, [approvalState, carryOn]);

  return (
    <section
      data-held-interrupt={runId}
      className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3"
    >
      <HeldStepCard
        wait={wait}
        identity={`${runId}:${checkpointId}`}
        stopped={false}
        paused
        onDecided={() => {
          if (!carried.current) void carryOn();
        }}
      />
      {carrying === "sending" ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Carrying on with the run…
        </p>
      ) : carrying === "idle" ? (
        <button
          type="button"
          data-held-carry-on=""
          onClick={() => void carryOn()}
          className="inline-flex min-h-11 items-center gap-1 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground sm:min-h-8"
        >
          <Play className="h-3.5 w-3.5" />
          Decided somewhere else? If nothing happens, carry on here
        </button>
      ) : null}
    </section>
  );
}

export default HeldInterrupt;
