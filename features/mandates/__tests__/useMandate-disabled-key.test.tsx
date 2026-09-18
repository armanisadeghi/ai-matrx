import { renderHook } from "@/test-utils/renderHook";

const resolveMandate = jest.fn();
const onMandateCacheInvalidated = jest.fn((_listener: unknown) => jest.fn());

jest.mock("../service", () => ({
  resolveMandate: (...args: unknown[]) => resolveMandate(...args),
  onMandateCacheInvalidated: (listener: unknown) =>
    onMandateCacheInvalidated(listener),
}));

import { useMandate } from "../useMandate";

describe("useMandate — disabled key", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(["", "   "])(
    "does not query or report loading for the empty sentinel %p",
    async (mandateKey) => {
      // `""` is the declared sentinel; `"   "` is the same intent written
      // sloppily, which the hook trims. Neither is a key, so neither is typed
      // as one — the cast is what makes the test able to pass the sentinel at
      // all now that the carrier is typed (V-L6a).
      const hook = await renderHook(() =>
        useMandate(mandateKey as ""),
      );

      expect(resolveMandate).not.toHaveBeenCalled();
      expect(hook.current).toEqual({
        mandate: null,
        loading: false,
        error: null,
        // 🚨 NOT `absent` (V-parity/UX F4): the door was never asked, so
        // "this job does not exist" is a claim nothing backs. A disabled
        // sentinel is silence, not a verdict.
        absent: false,
        // Same reasoning: nothing was asked, so there is nothing to wait for.
        organizationPending: false,
      });

      await hook.unmount();
    },
  );
});
