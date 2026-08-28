"use client";

/**
 * The served run form's two server verbs — FETCH the surface, START with it.
 *
 * Both go through the canonical typed `callApi` against the generated OpenAPI
 * paths; neither hand-rolls a fetch. They live here rather than in
 * `useWorkflowRunControls` only because the served surface is proving itself
 * on a bake-off first (R12): at adoption these fold into that hook and the
 * legacy `node_inputs` start argument dies with them.
 *
 * WHY THE START VERB IS NOT `useWorkflowRunControls.startRun`: the surface
 * contract needs a 409 `inputs_required` outcome that must reach the FORM as
 * a gap list, not a toast. A start refused for want of an input is never a
 * dead end. The live RunWorkflowRequest does not yet accept `input_sources`,
 * so this hook refuses human-stamped submissions until that generated
 * contract lands; silently downgrading them to `caller` would be a lie.
 */

import { useCallback, useEffect, useState } from "react";

import { useAppDispatch } from "@/lib/redux/hooks";
import { callApi, type ApiCallConfig } from "@/lib/api/call-api";

import {
  parseServedRunForm,
  readInputsRequiredGaps,
  type ServedInputGap,
  type ServedRunFormSchema,
  type ServedSubmission,
} from "./served-input";

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export type ServedRunFormState =
  | { status: "loading" }
  | { status: "ready"; form: ServedRunFormSchema }
  | { status: "error"; message: string };

/** GET /workflows/{id}/run-form → THE compiled input surface. */
export function useServedRunForm(definitionId: string): ServedRunFormState {
  const dispatch = useAppDispatch();
  const [state, setState] = useState<ServedRunFormState>({
    status: "loading",
  });

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    void (async () => {
      const result = await dispatch(
        callApi({
          path: "/workflows/{definition_id}/run-form",
          method: "GET",
          pathParams: { definition_id: definitionId },
        }),
      );
      if (!live) return;
      if (result.error) {
        setState({
          status: "error",
          message: result.error.message || "Could not load the run form.",
        });
        return;
      }
      setState({ status: "ready", form: parseServedRunForm(result.data) });
    })();
    return () => {
      live = false;
    };
  }, [dispatch, definitionId]);

  return state;
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

export type ServedStartOutcome =
  | { status: "started"; runId: string }
  /** 409 `inputs_required` — the server's own gap list, for the form. */
  | { status: "gaps"; gaps: ServedInputGap[]; message: string }
  | { status: "error"; message: string };

/** Pull the run_id out of the start route's detached NDJSON shell. */
function extractRunId(raw: string): string | null {
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed !== "object" || parsed === null) continue;
      const record = parsed as Record<string, unknown>;
      const data =
        typeof record.data === "object" && record.data !== null
          ? (record.data as Record<string, unknown>)
          : record;
      const runId = data.run_id;
      if (typeof runId === "string" && runId.length > 0) return runId;
    } catch {
      // not JSON — keep scanning
    }
  }
  return null;
}

export interface ServedRunStart {
  starting: boolean;
  start: (
    definitionId: string,
    submission: ServedSubmission,
  ) => Promise<ServedStartOutcome>;
}

export function useServedRunStart(): ServedRunStart {
  const dispatch = useAppDispatch();
  const [starting, setStarting] = useState(false);

  const start = useCallback(
    async (
      definitionId: string,
      submission: ServedSubmission,
    ): Promise<ServedStartOutcome> => {
      setStarting(true);
      try {
        if (Object.keys(submission.inputSources).length > 0) {
          return {
            status: "error",
            message:
              "This server cannot accept human-attributed workflow inputs yet.",
          };
        }
        const captured: { text: string | null } = { text: null };
        const path = "/workflows/{definition_id}/runs" as const;
        const config: ApiCallConfig<typeof path, "POST"> = {
          path,
          method: "POST",
          pathParams: { definition_id: definitionId },
          body: {
            inputs: submission.inputs,
            mode: "inline",
          },
          stream: true,
          consumeStream: async (response: Response) => {
            captured.text = await response.text();
          },
        };
        const result = await dispatch(callApi(config));
        if (result.error) {
          const gaps =
            result.error.status === 409
              ? readInputsRequiredGaps(result.error.serverDetail)
              : null;
          if (gaps) {
            return {
              status: "gaps",
              gaps,
              message:
                "This workflow still needs something from you before it can start.",
            };
          }
          return {
            status: "error",
            message: result.error.message || "Could not start the workflow.",
          };
        }
        const runId = captured.text ? extractRunId(captured.text) : null;
        if (!runId) {
          return {
            status: "error",
            message: "The workflow started but no run id came back.",
          };
        }
        return { status: "started", runId };
      } finally {
        setStarting(false);
      }
    },
    [dispatch],
  );

  return { starting, start };
}
