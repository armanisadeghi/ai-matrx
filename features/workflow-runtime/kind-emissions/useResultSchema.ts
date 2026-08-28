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

import { useAppDispatch } from "@/lib/redux/hooks";
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
  const [answered, setAnswered] = useState<Answered>({
    forId: definitionId,
    state: { status: "loading" },
  });

  useEffect(() => {
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
  }, [dispatch, definitionId]);

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
