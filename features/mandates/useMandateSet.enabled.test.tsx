/**
 * A PAGE MUST NOT RESOLVE WHAT IT DOES NOT RUN (2026-09-08).
 *
 * Production walk: the app-wide `<MessagingHost>` resolved the four
 * `messaging.*` intelligences on EVERY route — /mandates, /dashboard,
 * everywhere — for a conversation pane that was not on screen, so four honest
 * refusals became four console errors and four captured errors on every single
 * page load. The fix is this `enabled` lane plus a ref-counted demand declared
 * by the surface that actually renders the AI bar.
 *
 * These are the guards. Remove the `enabled` gate and the first two fail.
 */
import { renderHook } from "@/test-utils/renderHook";

const resolveMandate = jest.fn();

jest.mock("./service", () => ({
  resolveMandate: (key: string) => resolveMandate(key),
  onMandateCacheInvalidated: () => () => {},
}));

// eslint-disable-next-line import/first
import { useMandateSet } from "./useMandateSet";

const KEYS = [
  "messaging.conversation_catch_up",
  "messaging.conversation_summary",
];

describe("useMandateSet — enabled", () => {
  beforeEach(() => {
    resolveMandate.mockReset();
    resolveMandate.mockResolvedValue({ mandateKey: "x", agentId: "a" });
  });

  it("fires NOTHING while disabled", async () => {
    const hook = await renderHook(() => useMandateSet(KEYS, { enabled: false }));
    expect(resolveMandate).not.toHaveBeenCalled();
    // Deliberately an EMPTY set, not four `{mandate: null}` entries: a consumer
    // must not be able to read "we never asked" as "nothing is bound" and print
    // a refusal nobody earned.
    expect(Object.keys(hook.current)).toEqual([]);
    await hook.unmount();
  });

  it("resolves every key when enabled", async () => {
    const hook = await renderHook(() => useMandateSet(KEYS, { enabled: true }));
    expect(resolveMandate.mock.calls.map((c) => c[0])).toEqual(KEYS);
    await hook.unmount();
  });

  it("resolves by default — enabled is opt-out, so no existing caller changed", async () => {
    const hook = await renderHook(() => useMandateSet(KEYS));
    expect(resolveMandate.mock.calls.map((c) => c[0])).toEqual(KEYS);
    await hook.unmount();
  });
});
