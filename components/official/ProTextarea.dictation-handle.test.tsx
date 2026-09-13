/**
 * ProTextarea's imperative dictation handle.
 *
 * THE CLAIM UNDER TEST: `startDictation()` on the forwarded ref is not a
 * parallel recorder — it reaches `GlobalRecordingProvider.start` with the SAME
 * field context a click on the mic button produces; and on a box with
 * `enableVoice={false}` it REFUSES OUT LOUD (named reason, a sentence, a toast,
 * and `onTranscriptionError`) instead of doing nothing.
 *
 * The recorder is the only thing mocked: `useMicField` → `useVoiceCapture` →
 * `useGlobalRecordingOptional` all run for real, which is exactly what makes
 * "the same path the button takes" a real assertion rather than a restatement.
 */

import { act } from "react";
import { createRoot } from "react-dom/client";

import { TooltipProvider } from "@ai-matrx/design-system";

import { ProTextarea, type ProTextareaElement } from "./ProTextarea";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

// ── the mocked recorder ────────────────────────────────────────────────────
const recorderStart = jest.fn(async (_args: { context: unknown }) => {});
const recorderStop = jest.fn();

jest.mock("@/providers/GlobalRecordingProvider", () => ({
  useGlobalRecordingOptional: () => ({
    isActive: false,
    isFinalizing: false,
    context: null,
    start: recorderStart,
    stop: recorderStop,
    cancel: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
  }),
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

jest.mock("@/lib/toast", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    message: jest.fn(),
  },
}));
const { toast } = jest.requireMock("@/lib/toast") as {
  toast: { error: jest.Mock };
};

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

jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

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
jest.mock("@/features/surfaces/hooks/useSurfaceBoundAgents", () => ({
  useSurfaceBoundAgents: () => ({
    sections: [],
    loading: false,
    refresh: jest.fn(),
  }),
}));
jest.mock("@/features/surfaces/hooks/useSurfaceConfig", () => ({
  useSurfaceAgentRoles: () => ({ roles: {}, loading: false }),
}));

async function mount(props: React.ComponentProps<typeof ProTextarea> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const ref = { current: null as ProTextareaElement | null };
  await act(async () => {
    root.render(
      <TooltipProvider>
        <ProTextarea
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          value=""
          onChange={() => {}}
          {...props}
        />
      </TooltipProvider>,
    );
  });
  // The availability probe resolves a tick after mount.
  await act(async () => {
    await Promise.resolve();
  });
  return {
    ref,
    container,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

beforeAll(() => {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: jest.fn(),
      enumerateDevices: jest.fn(async () => []),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
  });
});

beforeEach(() => {
  recorderStart.mockClear();
  recorderStop.mockClear();
  toast.error.mockClear();
});

describe("ProTextarea imperative dictation handle", () => {
  it("startDictation() reaches the shared recorder with the same field context the mic button produces", async () => {
    const clicked = await mount({ id: "pro-box" });
    // What a CLICK on the mic button does.
    const micButton = clicked.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Start voice input"]',
    );
    expect(micButton).not.toBeNull();
    await act(async () => {
      micButton!.click();
    });
    expect(recorderStart).toHaveBeenCalledTimes(1);
    const fromClick = recorderStart.mock.calls[0][0];
    await clicked.unmount();

    recorderStart.mockClear();

    // What the HANDLE does, on an identical box.
    const keyed = await mount({ id: "pro-box" });
    let result: Awaited<
      ReturnType<NonNullable<ProTextareaElement["startDictation"]>>
    > | null = null;
    await act(async () => {
      result = (await keyed.ref.current?.startDictation?.()) ?? null;
    });
    expect(result).toEqual({ started: true });
    expect(recorderStart).toHaveBeenCalledTimes(1);
    const fromHandle = recorderStart.mock.calls[0][0];

    expect(fromHandle.context).toEqual(fromClick.context);
    expect(fromHandle.context).toMatchObject({
      kind: "field",
      instanceId: "pro-box",
    });
    await keyed.unmount();
  });

  it("refuses out loud on a voice-disabled box instead of silently doing nothing", async () => {
    const onTranscriptionError = jest.fn();
    const box = await mount({
      id: "muted-box",
      enableVoice: false,
      onTranscriptionError,
    });

    let result: Awaited<
      ReturnType<NonNullable<ProTextareaElement["startDictation"]>>
    > | null = null;
    await act(async () => {
      result = (await box.ref.current?.startDictation?.()) ?? null;
    });

    expect(result).toMatchObject({ started: false, reason: "voice-disabled" });
    expect((result as unknown as { message: string }).message).toMatch(/voice/i);
    expect(recorderStart).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(onTranscriptionError).toHaveBeenCalledTimes(1);
    await box.unmount();
  });

  it("exposes stopDictation() and isDictating() on the forwarded DOM node", async () => {
    const box = await mount({ id: "handle-box" });
    const el = box.ref.current;
    expect(el).toBeInstanceOf(HTMLTextAreaElement);
    expect(typeof el?.startDictation).toBe("function");
    expect(typeof el?.stopDictation).toBe("function");
    expect(el?.isDictating?.()).toBe(false);
    await box.unmount();
  });
});
