import reducer, { applyView, dismissView, hydrateActor, reserveTarget } from "./sandboxLifecycleSlice";

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

test("marks hydrated receipts as restored and consumes that marker on the first server view", () => {
  let state = reducer(undefined, hydrateActor({ actorId, receipts: [receipt] }));
  expect(state.views[0].restored).toBe(true);
  state = reducer(state, applyView({ actorId, generation: state.generation, view: { ...view, dismissed: true } }));
  expect(state.views[0]).toEqual(expect.objectContaining({ restored: false, dismissed: true, state: "success" }));
});

test("reserves only its target and releases it only after terminal server truth", () => {
  let state = reducer(undefined, hydrateActor({ actorId, receipts: [receipt] }));
  // Reloaded receipts reserve before the mounted controller can resolve them.
  expect(state.reservations).toEqual([expect.objectContaining({ row_id: receipt.row_id, operation_id: receipt.operation_id })]);
  state = reducer(state, reserveTarget({ actorId, generation: state.generation, reservation: receipt }));
  const other = { ...receipt, row_id: "44444444-4444-4444-8444-444444444444", operation_id: "55555555-5555-4555-8555-555555555555", kind: "delete" as const };
  state = reducer(state, reserveTarget({ actorId, generation: state.generation, reservation: other }));
  expect(state.reservations.map((reservation) => reservation.row_id)).toEqual([receipt.row_id, other.row_id]);
  state = reducer(state, applyView({ actorId, generation: state.generation, view: { ...view, state: "unknown", action: "retry" } }));
  expect(state.reservations).toHaveLength(2);
  state = reducer(state, applyView({ actorId, generation: state.generation, view }));
  expect(state.reservations).toEqual([other]);
});
