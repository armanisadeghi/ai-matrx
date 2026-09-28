/**
 * GUARD — the toast shown when a save keeps failing is ONE plain sentence with
 * a Retry now: no raw error text, and "offline" only when it is true.
 * (Live on aimatrx.com 2026-09-27 it read: "Your change is not saved yet: Your
 * preferences could not be saved: TypeError: Failed to fetch. It is kept on
 * this device and retried automatically.")
 */
const toastError = jest.fn();
const toastDismiss = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), dismiss: (...a: unknown[]) => toastDismiss(...a) },
}));

import {
  createRemoteWriteScheduler,
  remoteWriteFailureMessage,
} from "@/lib/sync/engine/remoteWrite";
import type { IdentityKey } from "@/lib/sync/types";

const person: IdentityKey = { type: "auth", userId: "u-notice", key: "auth:u-notice" };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function failingScheduler(error: string) {
  const policy = {
    config: {
      sliceName: "noticeCopy",
      preset: "warm-cache",
      version: 1,
      remote: {
        debounceMs: 50,
        write: async () => {
          throw new Error(`Your preferences could not be saved: ${error}`);
        },
      },
    },
  } as never;
  return createRemoteWriteScheduler({
    policies: [policy],
    store: { getState: () => ({}), dispatch: () => undefined } as never,
    getIdentity: () => person,
    attachPageHide: () => () => {},
  });
}

beforeEach(() => {
  toastError.mockReset();
  toastDismiss.mockReset();
});

it("offline: exactly the one sentence, with Retry now, no raw error", async () => {
  const scheduler = failingScheduler("TypeError: Failed to fetch");
  scheduler.schedule("noticeCopy", { n: 1 });
  await wait(6_700); // third failure
  expect(toastError).toHaveBeenCalledTimes(1);
  const [text, options] = toastError.mock.calls[0] as [string, { action: { label: string } }];
  expect(text).toBe("Couldn't save your change — you're offline. We'll keep trying.");
  expect(text).not.toMatch(/TypeError|Failed to fetch|could not be saved/);
  expect(options.action.label).toBe("Retry now");
  scheduler.dispose();
}, 20_000);

it("a server refusal never claims the person is offline", () => {
  expect(remoteWriteFailureMessage(false)).toBe("Couldn't save your change. We'll keep trying.");
});
