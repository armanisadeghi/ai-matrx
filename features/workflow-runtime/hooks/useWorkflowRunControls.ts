"use client";

/**
 * useWorkflowRunControls — the lifecycle verbs of a workflow run, as thin
 * `callApi` wrappers over the aidream endpoints. One hook owns every verb so
 * no surface ever hand-rolls a second start/pause/cancel path.
 *
 * Every verb is typed against the GENERATED OpenAPI paths: the path string,
 * its `{param}` set, and the request body all come from
 * `types/python-generated/api-types.ts`. A route or field that moves on the
 * server becomes a compile error here — which is the whole point, so never
 * reintroduce a stringly-typed `post(path, ...)` helper.
 *
 * Start is deliberately NOT streaming-coupled: `POST /workflows/{id}/runs`
 * returns a tiny detached-shell NDJSON whose first frames carry the run_id,
 * then the server detaches — the Run Stream Adapter (useWorkflowRun) is how
 * the client follows the run. We read the run_id from the response and hand
 * it back; the caller adopts it.
 */

import { useState } from "react";

import { useAppDispatch } from "@/lib/redux/hooks";
import { callApi, type ApiCallConfig, type ApiCallResult } from "@/lib/api/call-api";
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
  /**
   * Answer a `run_interrupted` question (Pause & Ask).
   *
   * `resumeValue` is an OBJECT because the engine's resume payload is one:
   * `control.human_input` populates its output model from these keys, so a
   * free-text answer travels as `{ answer: "…" }` — a bare string is refused
   * by the server (422), never silently accepted.
   */
  answerInterrupt: (
    runId: string,
    checkpointId: string,
    resumeValue: Record<string, unknown>,
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

/**
 * The lifecycle routes all answer with a detached NDJSON shell that nobody
 * reads except the two start verbs. `readBody` captures it; `drainBody`
 * throws it away — either way the body is consumed so the socket closes.
 */
function readBody(into: { text: string | null }) {
  return async (response: Response) => {
    into.text = await response.text();
  };
}

const drainBody = async (response: Response): Promise<void> => {
  await response.text();
};

export function useWorkflowRunControls(): WorkflowRunControls {
  const dispatch = useAppDispatch();
  const [starting, setStarting] = useState(false);

  /** Toast + boolean for a fire-and-forget lifecycle verb. */
  const settle = (label: string, result: ApiCallResult): boolean => {
    if (result.error) {
      toast.error(`Could not ${label}.`);
      return false;
    }
    return true;
  };

  const startAny = async (
    path: "/workflows/{definition_id}/runs" | "/workflows/{definition_id}/step-runs",
    { definitionId, inputs, nodeInputs, mode }: StartRunArgs,
    failure: string,
    missingId: string,
  ): Promise<string | null> => {
    setStarting(true);
    try {
      const body = {
        ...(inputs ? { inputs } : {}),
        ...(nodeInputs ? { node_inputs: nodeInputs } : {}),
        ...(mode ? { mode } : {}),
      };
      const captured: { text: string | null } = { text: null };
      const config: ApiCallConfig<typeof path, "POST"> = {
        path,
        method: "POST",
        pathParams: { definition_id: definitionId },
        body,
        stream: true,
        consumeStream: readBody(captured),
      };
      const result = await dispatch(callApi(config));
      if (result.error) {
        toast.error(failure);
        return null;
      }
      const runId = captured.text ? extractRunId(captured.text) : null;
      if (!runId) {
        toast.error(missingId);
        return null;
      }
      return runId;
    } finally {
      setStarting(false);
    }
  };

  return {
    starting,

    startRun: (args) =>
      startAny(
        "/workflows/{definition_id}/runs",
        { ...args, mode: args.mode ?? "inline" },
        "Could not start the workflow.",
        "The workflow started but no run id came back.",
      ),

    startStepRun: (args) =>
      startAny(
        "/workflows/{definition_id}/step-runs",
        { ...args, mode: undefined },
        "Could not prepare the step-by-step run.",
        "The run was prepared but no run id came back.",
      ),

    executeNode: async (runId, nodeId, inputs) =>
      settle(
        "run the step",
        await dispatch(
          callApi({
            path: "/runs/{run_id}/nodes/{node_id}/execute",
            method: "POST",
            pathParams: { run_id: runId, node_id: nodeId },
            body: inputs ? { inputs } : {},
            stream: true,
            consumeStream: drainBody,
          }),
        ),
      ),

    pause: async (runId) =>
      settle(
        "pause the run",
        await dispatch(
          callApi({
            path: "/runs/{run_id}/pause",
            method: "POST",
            pathParams: { run_id: runId },
            stream: true,
            consumeStream: drainBody,
          }),
        ),
      ),

    resumePaused: async (runId) =>
      settle(
        "resume the run",
        await dispatch(
          callApi({
            path: "/runs/{run_id}/resume-paused",
            method: "POST",
            pathParams: { run_id: runId },
            stream: true,
            consumeStream: drainBody,
          }),
        ),
      ),

    cancel: async (runId, mode) =>
      settle(
        "stop the run",
        await dispatch(
          callApi({
            path: "/runs/{run_id}/cancel",
            method: "POST",
            pathParams: { run_id: runId },
            queryParams: { mode: mode ?? "graceful" },
            stream: true,
            consumeStream: drainBody,
          }),
        ),
      ),

    answerInterrupt: async (runId, checkpointId, resumeValue) =>
      settle(
        "send the answer",
        await dispatch(
          callApi({
            path: "/runs/{run_id}/resume",
            method: "POST",
            pathParams: { run_id: runId },
            body: { checkpoint_id: checkpointId, resume_value: resumeValue },
            stream: true,
            consumeStream: drainBody,
          }),
        ),
      ),

    retryNode: async (runId, nodeId) =>
      settle(
        "retry the step",
        await dispatch(
          callApi({
            path: "/runs/{run_id}/nodes/{node_id}/retry",
            method: "POST",
            pathParams: { run_id: runId, node_id: nodeId },
            stream: true,
            consumeStream: drainBody,
          }),
        ),
      ),

    skipNode: async (runId, nodeId) =>
      settle(
        "skip the step",
        await dispatch(
          callApi({
            path: "/runs/{run_id}/nodes/{node_id}/skip",
            method: "POST",
            pathParams: { run_id: runId, node_id: nodeId },
            stream: true,
            consumeStream: drainBody,
          }),
        ),
      ),
  };
}
