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
      const hook = await renderHook(() => useMandate(mandateKey));

      expect(resolveMandate).not.toHaveBeenCalled();
      expect(hook.current).toEqual({
        mandate: null,
        loading: false,
        error: null,
      });

      await hook.unmount();
    },
  );
});
