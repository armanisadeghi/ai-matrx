/**
 * ProInput with a CALLBACK ref: the host gets the element AND every internal feature still
 * reaches it. Until 2026-10-08 ProInput used the forwarded ref as its own, so a callback ref
 * (no `.current`) silently disabled the width measure, dictation write-back, agent apply and
 * the pre-hydration keep. The width measure is the observable witness here: it must observe
 * the real <input>.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";

import { TooltipProvider } from "@ai-matrx/design-system";

import { ProInput } from "./ProInput";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const observed: Element[] = [];
globalThis.ResizeObserver = class {
  observe(el: Element) {
    observed.push(el);
  }
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

jest.mock("@/providers/GlobalRecordingProvider", () => ({
  useGlobalRecordingOptional: () => null,
}));

// No store in a unit mount: run every selector against one inert recordings
// slice (nothing is recording, so no surface owns the recorder).
const fakeState = {
  recordings: {
    isRecording: false,
    isPaused: false,
    isTranscribing: false,
    isFinalizing: false,
    liveTranscript: "",
    audioLevel: 0,
    durationSec: 0,
    context: null,
  },
  userAuth: { id: "test-user", createdAt: null },
  userPreferences: {
    mediaDevices: {
      audioInputDeviceId: "default",
      audioOutputDeviceId: "default",
      videoInputDeviceId: "default",
    },
  },
};
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector(fakeState),
  useAppDispatch: () => jest.fn(),
  useAppStore: () => ({
    getState: () => fakeState,
    dispatch: jest.fn(),
    subscribe: () => () => {},
  }),
}));
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));

jest.mock("@/lib/toast", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    message: jest.fn(),
  },
}));

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({
      from: () => ({
        select: () => ({
          is: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        }),
      }),
    }),
  },
}));

jest.mock("@ai-matrx/kit/media-query", () => ({ ...jest.requireActual("@ai-matrx/kit/media-query"), useIsMobile: () => false }));

// The "…" menu's agent machinery is a different subsystem entirely; stubbing it
// keeps this suite about the recorder path and nothing else.
jest.mock("./useProTextareaAgentAction", () => ({
  useProTextareaAgentAction: () => ({
    state: { status: "idle", text: "", error: null, actionId: null },
    run: jest.fn(),
    reset: jest.fn(),
    cancel: jest.fn(),
  }),
}));
jest.mock("@ai-matrx/chat/surfaces/hooks/useSurfaceBoundAgents", () => ({
  useSurfaceBoundAgents: () => ({
    sections: [],
    loading: false,
    refresh: jest.fn(),
  }),
}));
jest.mock("@ai-matrx/chat/surfaces/hooks/useSurfaceConfig", () => ({
  useSurfaceAgentRoles: () => ({ roles: {}, loading: false }),
}));


describe("ProInput merges a forwarded callback ref with its own", () => {
  it("hands the host the element and still measures that same element", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const received: (HTMLInputElement | null)[] = [];
    await act(async () => {
      root.render(
        <TooltipProvider>
          <ProInput value="" onChange={() => {}} ref={(node) => { received.push(node); }} />
        </TooltipProvider>,
      );
    });
    const input = container.querySelector("input");
    expect(input).not.toBeNull();
    expect(received).toContain(input);
    expect(observed).toContain(input);
    await act(async () => root.unmount());
    expect(received[received.length - 1]).toBeNull();
  });

  it("still fills an object ref", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const ref = { current: null as HTMLInputElement | null };
    await act(async () => {
      root.render(
        <TooltipProvider>
          <ProInput value="" onChange={() => {}} ref={ref} />
        </TooltipProvider>,
      );
    });
    expect(ref.current).toBe(container.querySelector("input"));
    await act(async () => root.unmount());
  });
});
