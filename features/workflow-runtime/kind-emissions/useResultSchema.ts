"use client";

/**
 * `GET /workflows/{id}/result-schema` — the declared result contract, fetched
 * through the canonical typed `callApi` against the generated OpenAPI path.
 * No hand-rolled fetch, exactly like `useServedRunForm` beside it.
 *
 * It lives in this bake-off-facing module rather than in the shipped run hooks
 * only because the contract is proving itself on a bake-off first (R12); at
 * adoption it folds in beside the served run form's two verbs.
 *
 * A FAILED READ IS NOT A DEAD PAGE. The promise is an ENHANCEMENT — the run
 * still streams, the steps still render — so `error` degrades to "no declared
 * deliverables" and the surface falls back to what a live run tells it. That is
 * why this returns a state union and never throws.
 */

import { useEffect, useState } from "react";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { callApi } from "@/lib/api/call-api";

import { parseResultSchema, type DeclaredResultSchema } from "./result-schema";

export type ResultSchemaState =
  | { status: "loading" }
  | { status: "ready"; schema: DeclaredResultSchema }
  | { status: "error"; message: string };

/**
 * The answer is stored WITH the id it answers, and a mismatch reads as
 * "loading" during render. That is why there is no `setState({loading})` at the
 * top of the effect: resetting state synchronously inside an effect costs a
 * second render pass on every id change, and — worse — leaves one frame where
 * the previous workflow's promise is on screen under the new workflow's name.
 */
interface Answered {
  forId: string;
  state: ResultSchemaState;
}

export function useResultSchema(definitionId: string): ResultSchemaState {
  const dispatch = useAppDispatch();
  /**
   * 🚨 THE HYDRATION RACE, and why this dependency is load-bearing.
   * Every backend transport calls `requireSelectedOrgId()`, which THROWS
   * ("Select an organization before sending this request.") until
   * `appContext.organization_id` has hydrated from the user's session. That
   * hydration is asynchronous and lands AFTER this component's first effect,
   * so a fetch fired on mount alone is refused on every cold load and never
   * retried — the promise reads as "this workflow couldn't be loaded" for the
   * whole visit. Depending on the id makes the effect re-run the moment
   * context arrives, which is the only honest fix: the request genuinely was
   * not sendable before.
   */
  const organizationId = useAppSelector(selectOrganizationId);
  const [answered, setAnswered] = useState<Answered>({
    forId: definitionId,
    state: { status: "loading" },
  });

  useEffect(() => {
    if (!organizationId) return; // not sendable yet — wait, never fail
    let live = true;
    void (async () => {
      const result = await dispatch(
        callApi({
          path: "/workflows/{definition_id}/result-schema",
          method: "GET",
          pathParams: { definition_id: definitionId },
        }),
      );
      if (!live) return;
      setAnswered({
        forId: definitionId,
        state: result.error
          ? {
              status: "error",
              message:
                result.error.message ||
                "Could not read what this workflow makes.",
            }
          : { status: "ready", schema: parseResultSchema(result.data) },
      });
    })();
    return () => {
      live = false;
    };
  }, [dispatch, definitionId, organizationId]);

  return answered.forId === definitionId
    ? answered.state
    : { status: "loading" };
}

/** The schema when it is ready, else null — for the common read-or-degrade. */
export function resultSchemaOrNull(
  state: ResultSchemaState,
): DeclaredResultSchema | null {
  return state.status === "ready" ? state.schema : null;
}
