/**
 * REGRESSION GUARD — an unsent chip made in another tab / device appears (and a sent or
 * dismissed one leaves) without a reload.
 *
 * Before: chips were read ONCE when the composer mounted; the live block-state feed was only
 * joined by a mounted interactive block, so a plain answer's page never heard anything. A second
 * tab showed a new edit chip only after a manual reload.
 * Use case: Dana edits the bakery plan's timeline on her laptop; her open phone tab shows the
 * edit chip within a moment, and loses it when the laptop sends.
 */
const listStagedBlockStates = jest.fn();
jest.mock("../blockStateService", () => ({
  ...jest.requireActual("../blockStateService"),
  setBlockState: jest.fn(),
  listStagedBlockStates: (...a: unknown[]) => listStagedBlockStates(...a),
  dismissBlockStateChip: jest.fn(),
}));
let feed: ((signal: unknown) => void) | null = null;
const subscribe = jest.fn((_unit: unknown, _user: string, listener: (s: unknown) => void) => {
  feed = listener;
  return () => {};
});
jest.mock("../blockStateRealtime", () => ({ subscribeBlockStateFeed: (...a: unknown[]) => (subscribe as unknown as (...x: unknown[]) => unknown)(...a) }));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => "u1" }));
const restageRemarks = jest.fn((...args: unknown[]) => ({ type: "restage", args }));
const unstageRemark = jest.fn((...args: unknown[]) => ({ type: "unstage", args }));
jest.mock("@ai-matrx/chat/agents/redux/execution-system/instance-resources/remarks", () => ({
  ...jest.requireActual("@ai-matrx/chat/agents/redux/execution-system/instance-resources/remarks"),
  restageRemarks: (...a: unknown[]) => restageRemarks(...a),
  unstageRemark: (...a: unknown[]) => unstageRemark(...a),
}));

import { createRemarkDurability } from "../remarkDurability";

const CONV = "8e922e0a-3838-4070-91af-b4181b202eb8";
const MSG = "5a531779-6541-4fad-8235-1e62cccac4a3";
const remark = { kind: "edit", target: { conversationId: CONV, messageId: MSG }, before: "a", after: "b", origin: "text" };
const row = (over: Record<string, unknown>) => ({
  id: "0b8f80c7-508d-4fb5-911b-854839b25d42", entity_type: "message", entity_id: MSG, block_key: `remark:edit:${MSG}`,
  kind: "remark", scope: "viewer", viewer_id: "u1", version: 2, state_version: 2, sent_version: 1, fingerprint: null, metadata: {},
  state: { remark, coalesceKey: `edit:${MSG}`, stagedIn: CONV, resourceId: "res_1" },
  ...over,
});
const store = () =>
  ({
    dispatch: jest.fn((a: unknown) => a),
    getState: () => ({
      instanceResources: { submittedIds: {}, byConversationId: {} },
      blockStates: { rows: {}, hydration: {}, errors: {} },
      messages: { byConversationId: { [CONV]: { orderedIds: ["m1", "m2"] } } },
    }),
  }) as never;
const settle = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => { feed = null; subscribe.mockClear(); restageRemarks.mockClear(); unstageRemark.mockClear(); listStagedBlockStates.mockReset(); });

it("joins the conversation's feed once the composer is up, and stages a chip another tab made", async () => {
  listStagedBlockStates.mockResolvedValue([]);
  createRemarkDurability(store()).restore(CONV);
  await settle();
  expect(subscribe).toHaveBeenCalledWith({ scope: "conversation", entityId: CONV }, "u1", expect.any(Function));
  feed!({ rows: [row({})] });
  await settle();
  expect(restageRemarks).toHaveBeenCalledTimes(1);
  expect((restageRemarks.mock.calls[0]![1] as Array<{ coalesceKey: string }>)[0]!.coalesceKey).toBe(`edit:${MSG}`);
});

it("a chip the other tab sent leaves this composer", async () => {
  listStagedBlockStates.mockResolvedValue([]);
  createRemarkDurability(store()).restore(CONV);
  await settle();
  feed!({ rows: [row({ sent_version: 2 })] });
  await settle();
  expect(unstageRemark).toHaveBeenCalledWith(CONV, `edit:${MSG}`, { retire: false });
  expect(restageRemarks).not.toHaveBeenCalled();
});

it("a conversation with no answers yet joins nothing (its topic would only be refused)", async () => {
  listStagedBlockStates.mockResolvedValue([]);
  const s = store() as unknown as { getState: () => { messages: unknown } };
  s.getState = () => ({ ...(store() as never as { getState: () => object }).getState(), messages: { byConversationId: {} } }) as never;
  createRemarkDurability(s as never).restore(CONV);
  await settle();
  expect(subscribe).not.toHaveBeenCalled();
});

it("a chip staged into ANOTHER conversation never lands here, even though it is about an answer here (live walk 2026-10-05)", async () => {
  listStagedBlockStates.mockResolvedValue([]);
  createRemarkDurability(store()).restore(CONV);
  await settle();
  const NEW_CHAT = "11111111-2222-4333-8444-555555555555";
  feed!({ rows: [row({ state: { remark, coalesceKey: `passage:${MSG}:q`, stagedIn: NEW_CHAT, resourceId: "res_9" } })] });
  await settle();
  expect(restageRemarks).not.toHaveBeenCalled();
});
