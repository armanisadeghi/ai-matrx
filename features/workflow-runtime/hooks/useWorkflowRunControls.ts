"use client";

/**
 * useWorkflowRunControls — the lifecycle verbs of a workflow run, as thin
 * `callApi` wrappers over the aidream endpoints. One hook owns every verb so
 * no surface ever hand-rolls a second start/pause/cancel path.
 *
 * Start is deliberately NOT streaming-coupled: `POST /workflows/{id}/runs`
 * returns a tiny detached-shell NDJSON whose first frames carry the run_id,
 * then the server detaches — the Run Stream Adapter (useWorkflowRun) is how
 * the client follows the run. We read the run_id from the response and hand
 * it back; the caller adopts it.
 */

import { useState } from "react";

import { useAppDispatch } from "@/lib/redux/hooks";
import { callApi } from "@/lib/api/call-api";
import { toast } from "@/lib/toast";

export interface StartRunArgs {
  definitionId: string;
  inputs?: Record<string, unknown>;
  nodeInputs?: Record<string, Record<string, unknown>>;
  mode?: "inline" | "queued";
}

export interface WorkflowRunControls {
  starting: boolean;
  /** Returns the new run_id, or null on failure (already toasted). */
  startRun: (args: StartRunArgs) => Promise<string | null>;
  /**
   * Create a STEP-MODE run: a paused run seeded at its entry frontier —
   * nothing executes until `executeNode` (the actions surface, Phase 4).
   * Returns the new run_id, or null on failure (already toasted).
   */
  startStepRun: (args: StartRunArgs) => Promise<string | null>;
  /**
   * Execute exactly ONE node of a parked/step-mode run (the server persists
   * its result and parks again). The adopted run stream reports progress —
   * callers never consume this response body.
   */
  executeNode: (
    runId: string,
    nodeId: string,
    inputs?: Record<string, unknown>,
  ) => Promise<boolean>;
  pause: (runId: string) => Promise<boolean>;
  resumePaused: (runId: string) => Promise<boolean>;
  cancel: (runId: string, mode?: "graceful" | "immediate") => Promise<boolean>;
  /** Answer a `run_interrupted` question (Pause & Ask). */
  answerInterrupt: (
    runId: string,
    checkpointId: string,
    resumeValue: unknown,
  ) => Promise<boolean>;
  retryNode: (runId: string, nodeId: string) => Promise<boolean>;
  skipNode: (runId: string, nodeId: string) => Promise<boolean>;
}

/** Pull a run_id out of a start/lifecycle NDJSON body. */
function extractRunId(raw: string): string | null {
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null) {
        const record = parsed as Record<string, unknown>;
        const data =
          typeof record.data === "object" && record.data !== null
            ? (record.data as Record<string, unknown>)
            : record;
        const runId = data.run_id;
        if (typeof runId === "string" && runId.length > 0) return runId;
      }
    } catch {
      // not JSON — keep scanning
    }
  }
  return null;
}

export function useWorkflowRunControls(): WorkflowRunControls {
  const dispatch = useAppDispatch();
  const [starting, setStarting] = useState(false);

  const post = async (
    path: string,
    pathParams: Record<string, string>,
    body?: Record<string, unknown>,
    queryParams?: Record<string, string>,
  ): Promise<{ ok: boolean; rawText: string | null }> => {
    let rawText: string | null = null;
    const result = await dispatch(
      callApi({
        // The workflow route family is typed in the generated paths; the
        // string is validated at the call sites below via the typed wrappers.
        path: path as never,
        method: "POST" as never,
        ...(Object.keys(pathParams).length > 0
          ? { pathParams: pathParams as never }
          : {}),
        ...(body ? { body: body as never } : {}),
        ...(queryParams ? { queryParams: queryParams as never } : {}),
        stream: true,
        consumeStream: async (response: Response) => {
          rawText = await response.text();
        },
      } as never),
    );
    const failed =
      typeof result === "object" &&
      result !== null &&
      "error" in result &&
      Boolean((result as { error?: unknown }).error);
    return { ok: !failed, rawText };
  };

  const verb = async (
    label: string,
    path: string,
    pathParams: Record<string, string>,
    body?: Record<string, unknown>,
    queryParams?: Record<string, string>,
  ): Promise<boolean> => {
    const { ok } = await post(path, pathParams, body, queryParams);
    if (!ok) toast.error(`Could not ${label}.`);
    return ok;
  };

  return {
    starting,
    startRun: async ({ definitionId, inputs, nodeInputs, mode }) => {
      setStarting(true);
      try {
        const { ok, rawText } = await post(
          "/workflows/{definition_id}/runs",
          { definition_id: definitionId },
          {
            ...(inputs ? { inputs } : {}),
            ...(nodeInputs ? { node_inputs: nodeInputs } : {}),
            mode: mode ?? "inline",
          },
        );
        if (!ok) {
          toast.error("Could not start the workflow.");
          return null;
        }
        const runId = rawText ? extractRunId(rawText) : null;
        if (!runId) {
          toast.error("The workflow started but no run id came back.");
          return null;
        }
        return runId;
      } finally {
        setStarting(false);
      }
    },
    startStepRun: async ({ definitionId, inputs, nodeInputs }) => {
      setStarting(true);
      try {
        const { ok, rawText } = await post(
          "/workflows/{definition_id}/step-runs",
          { definition_id: definitionId },
          {
            ...(inputs ? { inputs } : {}),
            ...(nodeInputs ? { node_inputs: nodeInputs } : {}),
          },
        );
        if (!ok) {
          toast.error("Could not prepare the step-by-step run.");
          return null;
        }
        const runId = rawText ? extractRunId(rawText) : null;
        if (!runId) {
          toast.error("The run was prepared but no run id came back.");
          return null;
        }
        return runId;
      } finally {
        setStarting(false);
      }
    },
    executeNode: (runId, nodeId, inputs) =>
      verb(
        "run the step",
        "/runs/{run_id}/nodes/{node_id}/execute",
        { run_id: runId, node_id: nodeId },
        inputs ? { inputs } : {},
      ),
    pause: (runId) => verb("pause the run", "/runs/{run_id}/pause", { run_id: runId }),
    resumePaused: (runId) =>
      verb("resume the run", "/runs/{run_id}/resume-paused", { run_id: runId }),
    cancel: (runId, mode) =>
      verb("stop the run", "/runs/{run_id}/cancel", { run_id: runId }, undefined, {
        mode: mode ?? "graceful",
      }),
    answerInterrupt: (runId, checkpointId, resumeValue) =>
      verb("send the answer", "/runs/{run_id}/resume", { run_id: runId }, {
        checkpoint_id: checkpointId,
        resume_value: resumeValue as Record<string, unknown>,
      }),
    retryNode: (runId, nodeId) =>
      verb("retry the step", "/runs/{run_id}/nodes/{node_id}/retry", {
        run_id: runId,
        node_id: nodeId,
      }),
    skipNode: (runId, nodeId) =>
      verb("skip the step", "/runs/{run_id}/nodes/{node_id}/skip", {
        run_id: runId,
        node_id: nodeId,
      }),
  };
}
