/**
 * HELD AND SET inside a text field (RC-B6). Clean up / Help / Custom agent may
 * open the workspace picker when no organization is selected; the picker takes
 * focus. That focus move used to CLOSE the "…" popover and reset the run, so
 * the person chose a workspace and nothing continued. While a choice is being
 * awaited the popover stays open; once it is not, it closes normally.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";

import { TooltipProvider } from "@ai-matrx/design-system";

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
  appContext: { organization_id: null, project_id: null, task_id: null, conversation_id: null },
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


let pendingChoice = false;
jest.mock("@/lib/organization/organization-gate", () => ({
  hasPendingOrganizationRequest: () => pendingChoice,
}));

async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <TooltipProvider>
        <ProTextarea value="some text" onChange={() => {}} />
      </TooltipProvider>,
    );
  });
  return root;
}

const menuVisible = () => document.body.textContent?.includes("Clean up") ?? false;

async function openMenu() {
  const trigger = document.querySelector<HTMLButtonElement>('button[aria-label="More options"]');
  expect(trigger).not.toBeNull();
  await act(async () => {
    trigger!.click();
  });
}

async function pressEscape() {
  await act(async () => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
}

it("the menu stays open while a workspace choice is awaited, and closes after", async () => {
  const root = await mount();
  await openMenu();
  expect(menuVisible()).toBe(true);

  pendingChoice = true;
  await pressEscape();
  expect(menuVisible()).toBe(true);

  pendingChoice = false;
  await pressEscape();
  expect(menuVisible()).toBe(false);
  await act(async () => root.unmount());
});
