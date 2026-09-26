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
 * Decided somewhere else (the chat, the table's page)? "Carry on with the run"
 * does the same resume; while the change is still waiting, the server says so.
 */

import { useCallback, useState } from "react";
import { Loader2, Play } from "lucide-react";

import { HeldStepCard } from "@/features/record-change-approvals/HeldStepCard";
import type { RecordChangeWait } from "@/features/record-change-approvals/recordChangeApproval";

import { useWorkflowRunControls } from "../hooks/useWorkflowRunControls";

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

  const carryOn = useCallback(async () => {
    setCarrying("sending");
    // The server derives the step's output from the approval; the value sent
    // here is ignored for a held step, so it is empty on purpose.
    const ok = await answerInterrupt(runId, checkpointId, {});
    setCarrying(ok ? "sent" : "idle");
  }, [answerInterrupt, runId, checkpointId]);

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
        onDecided={() => void carryOn()}
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
          Decided it somewhere else? Carry on with the run
        </button>
      ) : null}
    </section>
  );
}

export default HeldInterrupt;
