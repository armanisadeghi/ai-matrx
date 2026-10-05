/**
 * AN ANSWERED ASK NEVER LEAVES A WAITING STAMP (live 2026-10-05): after the person
 * answered, the stale waiting stamp with no ask left showed "The agent paused
 * without a visible question" + Continue. The answer door must move the stamp to
 * running immediately.
 */
const loadConversation = jest.fn((args: unknown) => ({ type: "load", args }));
jest.mock("../../redux/execution-system/thunks/load-conversation.thunk", () => ({
  loadConversation: (a: unknown) => loadConversation(a),
}));
jest.mock("../follow-what-is-still-in-flight", () => ({ followWhatIsStillInFlight: jest.fn() }));

import { rereadAndFollow } from "../reread-and-follow";

const WAITING = {
  executionId: "e1",
  userRequestId: "r1",
  status: "waiting_input",
  waitingInput: true,
  recoveryState: "prompt_visible",
  startedAt: null,
  checkedAt: "2026-10-05T00:00:00Z",
};

it("the answer door turns a waiting stamp into a running one before re-reading", async () => {
  const state = { conversations: { byConversationId: { c1: { serverOperation: WAITING } } } };
  const patches: Array<{ payload: { serverOperation: Record<string, unknown> } }> = [];
  const dispatch: any = jest.fn((action: any) => {
    if (typeof action === "function") return action(dispatch, () => state);
    if (action?.type?.includes?.("patchConversation")) patches.push(action);
    return { unwrap: () => Promise.resolve() };
  });
  await rereadAndFollow(dispatch, "c1", "test");
  expect(patches).toHaveLength(1);
  const op = patches[0].payload.serverOperation;
  expect(op.status).toBe("running");
  expect(op.waitingInput).toBe(false);
  expect(op.recoveryState).toBeUndefined();
});

it("leaves a conversation with no stamp alone", async () => {
  const state = { conversations: { byConversationId: { c1: {} } } };
  const dispatch: any = jest.fn((action: any) =>
    typeof action === "function" ? action(dispatch, () => state) : { unwrap: () => Promise.resolve() },
  );
  await rereadAndFollow(dispatch, "c1", "test");
  expect(dispatch.mock.calls.filter((c: any[]) => c[0]?.type?.includes?.("patch"))).toHaveLength(0);
});
