import reducer, { applyView, dismissView, hydrateActor } from "./sandboxLifecycleSlice";

const actorId = "11111111-1111-4111-8111-111111111111";
const receipt = { schema_version: 1 as const, row_id: "22222222-2222-4222-8222-222222222222", operation_id: "33333333-3333-4333-8333-333333333333", kind: "stop" as const, observation: "prepared" as const };
const view = { operation_id: receipt.operation_id, state: "success" as const, message: "done", sandboxId: "runtime", action: "check" as const, dismissed: false };

test("rejects a late generation view and retains a user dismissal across polling updates", () => {
  let state = reducer(undefined, hydrateActor({ actorId, receipts: [receipt] }));
  state = reducer(state, dismissView({ actorId, generation: state.generation, operationId: receipt.operation_id }));
  state = reducer(state, applyView({ actorId, generation: state.generation, view }));
  expect(state.views[0].dismissed).toBe(true);
  const late = reducer(state, applyView({ actorId, generation: state.generation - 1, view: { ...view, message: "late" } }));
  expect(late.views[0].message).toBe("done");
});
