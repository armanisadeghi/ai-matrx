/**
 * modelToolDefault — a model change sets the agent's automatic-tools default.
 *
 * Every place that changes an agent's model (the builder's model row, the
 * settings panel, tuning and variation restores) dispatches
 * `setAgentField({ field: "modelId" })`; watching that one action covers them
 * all. A model that cannot use tools turns "Allow automated tool injection"
 * off; moving back to one that can turns it on again unless the person
 * overrode it. Decision + bookkeeping: `applyModelToolDefault` in
 * auto-tools.thunks.ts. Rules: common-docs systems/agents/agent-tools/TOOL-SOURCES.md.
 */

import type { Action, UnknownAction } from "@reduxjs/toolkit";
import { delay, put, takeLatest } from "redux-saga/effects";
import { setAgentField } from "@/features/agents/redux/agent-builder.slice";
import { applyModelToolDefault } from "@/features/agents/redux/auto-tools.thunks";

/** Settle a quick run of model picks into one write. */
const SETTLE_MS = 400;

function isModelChange(
  action: Action,
): action is ReturnType<typeof setAgentField> {
  return (
    setAgentField.match(action) && action.payload.field === "modelId"
  );
}

function* handleModelChange(
  action: ReturnType<typeof setAgentField>,
): Generator {
  yield delay(SETTLE_MS);
  // put() runs through the store's full middleware chain, thunk included.
  yield put(
    applyModelToolDefault({
      agentId: action.payload.id,
    }) as unknown as UnknownAction,
  );
}

export function* watchModelToolDefault(): Generator {
  yield takeLatest(isModelChange, handleModelChange);
}
