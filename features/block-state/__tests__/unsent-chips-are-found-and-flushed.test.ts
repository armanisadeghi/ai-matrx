/**
 * An unsent chip must be (1) found again when its conversation has no record yet
 * ("New chat about this": a fresh id is minted on every mount) and (2) saved —
 * with its ref in hand — before a send goes out.
 * Use case: Dana selects a sentence, "New chat about this", reloads before typing; the chip is
 * still there. She sends within a second of adding a note; the note carries its row and clears.
 */
const setBlockState = jest.fn();
const listStagedBlockStates = jest.fn();
jest.mock("../blockStateService", () => ({
  ...jest.requireActual("../blockStateService"),
  setBlockState: (...a: unknown[]) => setBlockState(...a),
  listStagedBlockStates: (...a: unknown[]) => listStagedBlockStates(...a),
  dismissBlockStateChip: jest.fn(),
}));

import { createRemarkDurability } from "../remarkDurability";
import { BLOCK_STATE_DEBOUNCE_MS } from "../useBlockState";

const MSG = "33333333-3333-4333-8333-333333333333";
const comment = {
  kind: "comment" as const,
  target: { conversationId: "old-chat", messageId: MSG },
  commentId: null,
  quote: "the second paragraph",
  body: "",
};
const fakeStore = () =>
  ({
    dispatch: jest.fn(),
    getState: () => ({ instanceResources: { submittedIds: {}, byConversationId: {} }, blockStates: { rows: {}, hydration: {}, errors: {} } }),
  }) as never;

const savedRow = (state: Record<string, unknown>, v = 1) => ({
  id: "44444444-4444-4444-8444-444444444444", entity_type: "message", entity_id: MSG, block_key: "remark:passage:x",
  kind: "remark", scope: "viewer", viewer_id: "u", state, state_version: v, sent_version: 0, fingerprint: null, metadata: {}, version: 1,
});

beforeEach(() => { jest.useFakeTimers(); setBlockState.mockReset(); listStagedBlockStates.mockReset(); });
afterEach(() => jest.useRealTimers());

it("finds a chip staged into a different (re-minted) conversation by its surface and re-keys it", async () => {
  jest.useRealTimers();
  const staged = savedRow({ remark: comment, coalesceKey: "passage:x", stagedIn: "old-conv", stagedSurface: "alias:chat-new", resourceId: "r1" });
  listStagedBlockStates.mockResolvedValue([staged]);
  setBlockState.mockResolvedValue(savedRow({ ...staged.state, stagedIn: "new-conv" }, 2));
  const store = fakeStore();
  createRemarkDurability(store).restore("new-conv", "alias:chat-new");
  await new Promise((r) => setTimeout(r, 20));
  expect(listStagedBlockStates).toHaveBeenCalledWith("new-conv", "alias:chat-new");
  expect(setBlockState).toHaveBeenCalledWith(expect.objectContaining({ blockKey: "remark:passage:x", patch: expect.objectContaining({ stagedIn: "new-conv" }) }));
});

it("a pending chip write is flushed on demand and a send waits for it", async () => {
  setBlockState.mockResolvedValue(savedRow({}, 1));
  const durability = createRemarkDurability(fakeStore());
  durability.save("c1", "res1", "passage:x", comment);
  expect(durability.hasPending("c1")).toBe(true);
  expect(setBlockState).not.toHaveBeenCalled(); // still inside the debounce
  await durability.flush("c1");
  expect(setBlockState).toHaveBeenCalledTimes(1); // written NOW, not after the debounce
  expect(durability.hasPending("c1")).toBe(false);
  jest.advanceTimersByTime(BLOCK_STATE_DEBOUNCE_MS * 2);
  expect(setBlockState).toHaveBeenCalledTimes(1); // the old timer did not write again
});
