/**
 * Pinned messages are per-person state in the ONE per-user store
 * (`platform.user_entity_state`, entity_type "message") — never a new table.
 * The store must: hydrate from getBulk, toggle optimistically through
 * setPinned, and ROLL BACK loudly when the write fails (a pin that says it
 * saved but did not is a screen that lies).
 */

const setPinned = jest.fn();
const getBulk = jest.fn();

jest.mock("@/features/scopes/service/favoritesService", () => ({
  favoritesService: {
    setPinned: (...a: unknown[]) => setPinned(...a),
    getBulk: (...a: unknown[]) => getBulk(...a),
  },
}));
const toastError = jest.fn();
jest.mock("@/lib/toast", () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: jest.fn() } }));

import {
  MESSAGE_PIN_ENTITY_TYPE,
  __resetPinnedMessagesForTests,
  hydratePinnedMessages,
  isMessagePinned,
  togglePinnedMessage,
} from "../pinned-messages-store";

beforeEach(() => {
  __resetPinnedMessagesForTests();
  setPinned.mockReset();
  getBulk.mockReset();
  toastError.mockReset();
});

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

it("uses the registered chat message token", () => {
  expect(MESSAGE_PIN_ENTITY_TYPE).toBe("message");
});

it("hydrates from the per-user store", async () => {
  getBulk.mockResolvedValue({ ok: true, data: { items: [{ entityId: ID_A, isPinned: true }, { entityId: ID_B, isPinned: false }] } });
  await hydratePinnedMessages([ID_A, ID_B]);
  expect(getBulk).toHaveBeenCalledWith("message", [ID_A, ID_B]);
  expect(isMessagePinned(ID_A)).toBe(true);
  expect(isMessagePinned(ID_B)).toBe(false);
});

it("toggles through setPinned", async () => {
  setPinned.mockResolvedValue({ ok: true, data: null });
  await expect(togglePinnedMessage(ID_A)).resolves.toBe(true);
  expect(setPinned).toHaveBeenCalledWith("message", ID_A, true);
  expect(isMessagePinned(ID_A)).toBe(true);
  await expect(togglePinnedMessage(ID_A)).resolves.toBe(false);
  expect(setPinned).toHaveBeenLastCalledWith("message", ID_A, false);
});

it("rolls back and says so when the write fails", async () => {
  setPinned.mockResolvedValue({ ok: false, error: { message: "denied" } });
  await expect(togglePinnedMessage(ID_A)).resolves.toBe(false);
  expect(isMessagePinned(ID_A)).toBe(false);
  expect(toastError).toHaveBeenCalled();
});

it("refuses a non-uuid id (an unsaved message cannot be pinned)", async () => {
  await expect(togglePinnedMessage("temp-123")).resolves.toBe(false);
  expect(setPinned).not.toHaveBeenCalled();
  expect(toastError).toHaveBeenCalled();
});
