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
 * contract needs two things that hook does not carry — `input_sources` (THE
 * source=human invariant: only this human-facing path may stamp `human`) and
 * a 409 `inputs_required` outcome that must reach the FORM as a gap list,
 * not a toast. A start refused for want of an input is never a dead end.
 */

import { useCallback, useEffect, useState } from "react";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
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

/**
 * GET /workflows/{id}/run-form → THE compiled input surface.
 *
 * `null` means "somebody else already has this answer" — the hook then makes
 * no request and stays `loading` forever, which is what a caller that is about
 * to ignore the result wants. (`ServedRunForm` passes null when its host
 * hoisted the fetch to decide between served and legacy.) It is never a way to
 * express "no workflow": a surface with no definition has nothing to render.
 */
export function useServedRunForm(
  definitionId: string | null,
): ServedRunFormState {
  const dispatch = useAppDispatch();
  /**
   * 🚨 THE HYDRATION RACE (found on the proving ground, 2026-08-28).
   * `requireSelectedOrgId()` THROWS until `appContext.organization_id` has
   * hydrated from the session, and that lands AFTER this component's first
   * effect. Fetching on mount alone meant EVERY cold load of a served run form
   * showed "Could not load the run form — Select an organization before
   * sending this request", permanently, with no retry: the form was
   * unreachable unless the user happened to re-navigate after hydration.
   * Depending on the id re-runs the fetch the moment context arrives.
   */
  const organizationId = useAppSelector(selectOrganizationId);
  const [state, setState] = useState<ServedRunFormState>({
    status: "loading",
  });

  useEffect(() => {
    if (!organizationId) return; // not sendable yet — wait, never fail
    if (definitionId === null) return; // the host holds the answer
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
  }, [dispatch, definitionId, organizationId]);

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
        const captured: { text: string | null } = { text: null };
        const path = "/workflows/{definition_id}/runs" as const;
        const config: ApiCallConfig<typeof path, "POST"> = {
          path,
          method: "POST",
          pathParams: { definition_id: definitionId },
          body: {
            inputs: submission.inputs,
            // THE source=human invariant, client side: this form is the human
            // path, so exactly the values a person typed are claimed `human`.
            input_sources: submission.inputSources,
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
