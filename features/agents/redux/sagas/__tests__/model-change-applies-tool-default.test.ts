/**
 * Every model change (setAgentField "modelId") reaches applyModelToolDefault;
 * other field edits never do. The saga is what lets the builder row, the
 * settings window and the restores all share one rule.
 */
import { runSaga, stdChannel, type Saga } from "redux-saga";
import type { UnknownAction } from "@reduxjs/toolkit";

const applyModelToolDefault = jest.fn((arg: { agentId: string }) => ({
  type: "test/applyModelToolDefault",
  payload: arg,
}));

jest.mock("@/features/agents/redux/auto-tools.thunks", () => ({
  applyModelToolDefault: (arg: { agentId: string }) => applyModelToolDefault(arg),
}));

import { setAgentField } from "@/features/agents/redux/agent-builder.slice";
import { watchModelToolDefault } from "@/features/agents/redux/sagas/modelToolDefault.saga";

function startWatcher() {
  const dispatched: UnknownAction[] = [];
  const channel = stdChannel<UnknownAction>();
  const task = runSaga(
    {
      channel,
      dispatch: (a: UnknownAction) => dispatched.push(a),
      getState: () => ({}),
    },
    watchModelToolDefault as Saga,
  );
  const emit = (a: UnknownAction) => channel.put(a);
  return { task, dispatched, emit };
}

describe("model change applies the automatic-tools default", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    applyModelToolDefault.mockClear();
  });
  afterEach(() => jest.useRealTimers());

  it("runs once for a model pick", async () => {
    const { task, dispatched, emit } = startWatcher();
    emit(setAgentField({ id: "a1", field: "modelId", value: "m-image" }));
    await jest.advanceTimersByTimeAsync(1000);
    expect(applyModelToolDefault).toHaveBeenCalledWith({ agentId: "a1" });
    expect(dispatched).toHaveLength(1);
    task.cancel();
  });

  it("settles a quick run of picks into one", async () => {
    const { task, emit } = startWatcher();
    emit(setAgentField({ id: "a1", field: "modelId", value: "m1" }));
    emit(setAgentField({ id: "a1", field: "modelId", value: "m2" }));
    await jest.advanceTimersByTimeAsync(1000);
    expect(applyModelToolDefault).toHaveBeenCalledTimes(1);
    task.cancel();
  });

  it("ignores every other field", async () => {
    const { task, emit } = startWatcher();
    emit(setAgentField({ id: "a1", field: "name", value: "New name" }));
    await jest.advanceTimersByTimeAsync(1000);
    expect(applyModelToolDefault).not.toHaveBeenCalled();
    task.cancel();
  });
});
