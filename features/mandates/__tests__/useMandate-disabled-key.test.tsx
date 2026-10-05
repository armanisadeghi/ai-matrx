import * as React from "react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { renderHook } from "@/test-utils/renderHook";

// The mandate hooks read the selected organization from the store (it is part
// of the question), so they render under one, as they do in the app.
const testStore = configureStore({ reducer: { chatHost: () => ({ org: null }) } });
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <Provider store={testStore}>{children}</Provider>
);

const resolveMandate = jest.fn();
const onMandateCacheInvalidated = jest.fn((_listener: unknown) => jest.fn());

jest.mock("@ai-matrx/chat/mandates/service", () => ({
  resolveMandate: (...args: unknown[]) => resolveMandate(...args),
  onMandateCacheInvalidated: (listener: unknown) =>
    onMandateCacheInvalidated(listener),
}));

import { useMandate } from "@ai-matrx/chat/mandates/useMandate";

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
      const hook = await renderHook(() => useMandate(mandateKey as ""), {
        wrapper,
      });

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
