/**
 * GATES-TAIL-2. Pinning a message flipped the pin BEFORE `platform.user_entity_state` answered
 * (optimistic), so the Pinned badge and the pinned filter claimed a pin the server could still
 * refuse. Rule: pending, never optimistic — the message reads "pinning" until the write lands,
 * a second press while pending is not a second write, and a refusal is said in words.
 */
const setPinned = jest.fn();
jest.mock("@/features/scopes/service/favoritesService", () => ({
  favoritesService: { setPinned: (...a: unknown[]) => setPinned(...a), getBulk: jest.fn() },
}));
const toastError = jest.fn();
jest.mock("@/lib/toast", () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: jest.fn() } }));

import * as store from "../pinned-messages-store";

const ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  store.__resetPinnedMessagesForTests();
  setPinned.mockReset();
  toastError.mockReset();
});

it("reads not-pinned and pending while the write is in flight; pinned once it lands", async () => {
  let answer!: (v: unknown) => void;
  setPinned.mockImplementation(() => new Promise((r) => { answer = r; }));
  const done = store.togglePinnedMessage(ID);
  await Promise.resolve();
  expect(store.isMessagePinned(ID)).toBe(false);
  expect((store as { isMessagePinPending?: (id: string) => boolean }).isMessagePinPending?.(ID)).toBe(true);
  void store.togglePinnedMessage(ID); // a second press while pending
  expect(setPinned).toHaveBeenCalledTimes(1);
  answer({ ok: true, data: null });
  await expect(done).resolves.toBe(true);
  expect(store.isMessagePinned(ID)).toBe(true);
  expect((store as { isMessagePinPending?: (id: string) => boolean }).isMessagePinPending?.(ID)).toBe(false);
});

it("a refusal never showed the pin, and is said in words with a remedy", async () => {
  setPinned.mockResolvedValue({ ok: false, error: { code: "42501", message: "permission denied for function ues_set_pinned" } });
  await expect(store.togglePinnedMessage(ID)).resolves.toBe(false);
  expect(store.isMessagePinned(ID)).toBe(false);
  const [title, opts] = toastError.mock.calls[0] as [string, { description?: string }];
  expect(title).toBe("Could not pin this message.");
  expect(`${title} ${opts.description}`).not.toMatch(/permission denied for|ues_set_pinned/);
  expect(opts.description).toMatch(/Try again/);
});
