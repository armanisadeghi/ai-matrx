/**
 * Prompt and template text boxes (the template editors' ProTextarea (the template editors) and
 * the HTML-page Plain tab): bytes are sacred.
 *
 *  1. Opening a box with a value writes nothing — onChange never fires, the
 *     text is byte-identical (trailing blank lines, {{variables}}).
 *  2. The one formatting layer works in it (Ctrl+B wraps the selection) and
 *     leaves every {{variable}} exactly as typed.
 */
import React, { act, useState } from "react";
import { TooltipProvider } from "@ai-matrx/design-system";
import { createRoot, type Root } from "react-dom/client";
import { ProTextarea } from "@/components/official/ProTextarea";
import { MarkdownPlainTextTab } from "@/features/html-pages/components/tabs/MarkdownPlainTextTab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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
  appContext: {
    organization_id: null,
    project_id: null,
    task_id: null,
    conversation_id: null,
  },
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
const { toast } = jest.requireMock("@/lib/toast") as {
  toast: { error: jest.Mock };
};

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({
      from: () => ({
        select: () => ({
          is: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null }) }),
          }),
        }),
      }),
    }),
  },
}));

jest.mock("@ai-matrx/kit/media-query", () => ({ ...jest.requireActual("@ai-matrx/kit/media-query"), useIsMobile: () => false }));

// The "…" menu's agent machinery is a different subsystem entirely; stubbing it
// keeps this suite about the recorder path and nothing else.
jest.mock("@/components/official/useProTextareaAgentAction", () => ({
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


const BYTES = "Hello {{first_name}},\n\nYour {{order.id}} is ready.\n\n\n  indented  \n";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function chord(el: HTMLTextAreaElement, key: string) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, cancelable: true }));
  });
}

function select(el: HTMLTextAreaElement, needle: string) {
  const start = el.value.indexOf(needle);
  act(() => {
    el.focus();
    el.setSelectionRange(start, start + needle.length);
  });
}

const PlainTab = ({ onChange }: { onChange: (v: string) => void }) => {
  const [md, setMd] = useState(BYTES);
  return (
    <MarkdownPlainTextTab
      {...({
        state: { currentMarkdown: md },
        actions: {
          setCurrentMarkdown: (v: string) => {
            onChange(v);
            setMd(v);
          },
        },
      } as unknown as React.ComponentProps<typeof MarkdownPlainTextTab>)}
    />
  );
};

const Template = ({ onChange }: { onChange: (v: string) => void }) => {
  const [v, setV] = useState(BYTES);
  return (
    <TooltipProvider>
    <ProTextarea
      value={v}
      onChange={(e) => {
        onChange(e.target.value);
        setV(e.target.value);
      }}
    />
    </TooltipProvider>
  );
};

describe.each([
  ["template box", Template],
  ["HTML-page Plain tab", PlainTab],
])("%s", (_name, Box) => {
  test("opening it with no edit writes nothing and keeps the bytes", () => {
    const onChange = jest.fn();
    act(() => root.render(<Box onChange={onChange} />));
    const el = host.querySelector("textarea") as HTMLTextAreaElement;
    expect(el.value).toBe(BYTES);
    select(el, "{{first_name}}");
    act(() => root.render(<Box onChange={onChange} />));
    expect(onChange).not.toHaveBeenCalled();
    expect(el.value).toBe(BYTES);
  });

  test("the formatting layer inserts markdown on request and never touches {{variables}}", () => {
    const onChange = jest.fn();
    act(() => root.render(<Box onChange={onChange} />));
    const el = host.querySelector("textarea") as HTMLTextAreaElement;
    select(el, "ready");
    chord(el, "b");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(el.value).toBe(BYTES.replace("ready", "**ready**"));
    expect(el.value).toContain("{{first_name}}");
    expect(el.value).toContain("{{order.id}}");
  });

  test("typing never auto-formats", () => {
    const onChange = jest.fn();
    act(() => root.render(<Box onChange={onChange} />));
    const el = host.querySelector("textarea") as HTMLTextAreaElement;
    chord(el, "q");
    expect(onChange).not.toHaveBeenCalled();
    expect(el.value).toBe(BYTES);
  });
});
