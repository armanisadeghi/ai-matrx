/**
 * THE PRE-HYDRATION KEEP: text typed, pasted or dictated into a server-rendered
 * ProTextarea BEFORE React hydrates it reaches the host's state.
 *
 * Found on /applets/build in production (lane P, 2026-10-07): the box is on
 * screen ~11 s before hydration; whatever she typed in that window was wiped at
 * hydration and the Build button bound to it stayed disabled. The page here is
 * rendered to HTML on the "server", typed into while it is still plain HTML,
 * then hydrated — the host's state must hold the text and the box must still
 * show it after the next render.
 */

import { act, useState } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

import { TooltipProvider } from "@ai-matrx/design-system";

import { ProInput } from "./ProInput";
import { ProTextarea } from "./ProTextarea";

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

const seen: string[] = [];
function Host() {
  const [text, setText] = useState("");
  seen.push(text);
  return (
    <TooltipProvider>
      <ProTextarea aria-label="What you want" value={text} onChange={(e) => setText(e.target.value)} />
      <button type="button" data-build="" disabled={!text.trim()}>
        Build
      </button>
    </TooltipProvider>
  );
}

/** What a person (or Playwright's fill, or dictation) does to a plain HTML box: set its value. */
function typeBeforeHydration(box: HTMLTextAreaElement, text: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(box, text);
  box.dispatchEvent(new Event("input", { bubbles: true }));
}

test("text typed before hydration reaches the host and survives the next render", async () => {
  const container = document.createElement("div");
  container.innerHTML = renderToString(<Host />);
  document.body.appendChild(container);
  const box = container.querySelector("textarea") as HTMLTextAreaElement;
  const build = container.querySelector("button[data-build]") as HTMLButtonElement;
  expect(build.disabled).toBe(true);

  typeBeforeHydration(box, "A tracker for my posts");

  seen.length = 0;
  let root: ReturnType<typeof hydrateRoot> | null = null;
  await act(async () => {
    root = hydrateRoot(container, <Host />);
  });
  await act(async () => {
    await Promise.resolve();
  });

  expect(seen.at(-1)).toBe("A tracker for my posts");
  expect(box.value).toBe("A tracker for my posts");
  expect((container.querySelector("button[data-build]") as HTMLButtonElement).disabled).toBe(false);

  // A person typing after hydration still works — the keep runs once.
  await act(async () => {
    typeBeforeHydration(box, "A tracker for my posts and brands");
  });
  expect(seen.at(-1)).toBe("A tracker for my posts and brands");

  await act(async () => root?.unmount());
  container.remove();
});

test("an untouched server-rendered box hydrates empty and calls nothing", async () => {
  const container = document.createElement("div");
  container.innerHTML = renderToString(<Host />);
  document.body.appendChild(container);
  seen.length = 0;
  let root: ReturnType<typeof hydrateRoot> | null = null;
  await act(async () => {
    root = hydrateRoot(container, <Host />);
  });
  expect(seen.every((s) => s === "")).toBe(true);
  expect((container.querySelector("textarea") as HTMLTextAreaElement).value).toBe("");
  await act(async () => root?.unmount());
  container.remove();
});

function InputHost() {
  const [text, setText] = useState("");
  seen.push(text);
  return (
    <TooltipProvider>
      <ProInput aria-label="Name" value={text} onChange={(e) => setText(e.target.value)} />
    </TooltipProvider>
  );
}

test("ProInput keeps text typed before hydration too", async () => {
  const container = document.createElement("div");
  container.innerHTML = renderToString(<InputHost />);
  document.body.appendChild(container);
  const box = container.querySelector("input[aria-label=Name]") as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(box, "Glow Co");
  box.dispatchEvent(new Event("input", { bubbles: true }));
  seen.length = 0;
  let root: ReturnType<typeof hydrateRoot> | null = null;
  await act(async () => {
    root = hydrateRoot(container, <InputHost />);
  });
  expect(seen.at(-1)).toBe("Glow Co");
  expect(box.value).toBe("Glow Co");
  await act(async () => root?.unmount());
  container.remove();
});
