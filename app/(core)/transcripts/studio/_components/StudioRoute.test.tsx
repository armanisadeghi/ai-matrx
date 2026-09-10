/** @jest-environment jsdom */

/**
 * StudioRoute — the /transcripts/studio page entry.
 *
 * SUT: `StudioRoute`. It OWNS: importing a linked transcript exactly once for
 * the signed-in user (from the store), replacing the dead import URL with the
 * new session, never navigating after the page is gone, telling the user when
 * the transcript is unavailable, and mounting the studio in PAGE mode with the
 * server's session.
 *
 * Real here: the Redux store (slim root reducer), `promoteTranscriptThunk`,
 * `StudioView` and its session-route hook. Doubles: the database services
 * (`fetchTranscriptById`, `promoteTranscriptToStudio`, `listSessions`,
 * `listRawSegments`), Next's router/search params, and `StudioLayout` — the
 * column UI below the view, which nothing here asserts on.
 */

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

import { act, StrictMode, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { setUserAuth } from "@/lib/redux/slices/userAuthSlice";
import { sessionsListLoaded } from "@/features/transcript-studio/redux/slice";
import { fetchTranscriptById } from "@/features/transcripts/service/transcriptsService";
import {
  promoteTranscriptToStudio,
  type PromoteToStudioResult,
} from "@/features/transcript-studio/service/transcriptBridge";
import {
  listRawSegments,
  listSessions,
} from "@/features/transcript-studio/service/studioService";
import type { StudioSession } from "@/features/transcript-studio/types";
import type { Transcript } from "@/features/transcripts/types";
import { toast } from "@/lib/toast";

import { StudioRoute } from "./StudioRoute";

const mockRouterReplace = jest.fn();
const mockRouterPush = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockRouterReplace,
    push: mockRouterPush,
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/transcripts/studio",
}));

jest.mock("@/features/transcripts/service/transcriptsService", () => ({
  ...jest.requireActual<
    typeof import("@/features/transcripts/service/transcriptsService")
  >("@/features/transcripts/service/transcriptsService"),
  fetchTranscriptById: jest.fn(),
}));

jest.mock("@/features/transcript-studio/service/transcriptBridge", () => ({
  ...jest.requireActual<
    typeof import("@/features/transcript-studio/service/transcriptBridge")
  >("@/features/transcript-studio/service/transcriptBridge"),
  promoteTranscriptToStudio: jest.fn(),
}));

jest.mock("@/features/transcript-studio/service/studioService", () => ({
  ...jest.requireActual<
    typeof import("@/features/transcript-studio/service/studioService")
  >("@/features/transcript-studio/service/studioService"),
  listSessions: jest.fn(),
  listRawSegments: jest.fn(),
}));

jest.mock("@/features/transcript-studio/components/StudioLayout", () => ({
  StudioLayout: () => null,
}));

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TRANSCRIPT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROMOTED_SESSION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SERVER_SESSION_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const URL_SESSION_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const UNAVAILABLE_MESSAGE =
  "That transcript isn't available — it may have been deleted, or it isn't shared with you.";

const transcript = {
  id: TRANSCRIPT_ID,
  created_by: USER_ID,
  title: "Canary interview",
  description: "",
  segments: [{ id: "seg-1", timecode: "00:00", seconds: 0, text: "hello" }],
  metadata: { duration: 12 },
  audio_file_path: null,
  video_file_path: null,
  source_type: "audio",
  tags: [],
  folder_name: "Recordings",
  is_draft: false,
  created_at: "2026-09-01T10:00:00.000Z",
  updated_at: "2026-09-01T10:05:00.000Z",
} satisfies Transcript;

const promoted = {
  sessionId: PROMOTED_SESSION_ID,
  rawSegmentCount: 1,
  alreadyPromoted: false,
} satisfies PromoteToStudioResult;

function studioSession(id: string): StudioSession {
  return {
    id,
    userId: USER_ID,
    organizationId: null,
    projectId: null,
    transcriptId: null,
    title: "Existing session",
    status: "stopped",
    moduleId: "tasks",
    source: "studio",
    startedAt: "2026-09-01T09:00:00.000Z",
    endedAt: "2026-09-01T09:30:00.000Z",
    totalDurationMs: 1_800_000,
    audioStoragePath: null,
    assistantConversationId: null,
    assistantConversations: [],
    createdAt: "2026-09-01T09:00:00.000Z",
    updatedAt: "2026-09-01T09:30:00.000Z",
  };
}

function makeStore() {
  return configureStore({ reducer: createSlimRootReducer() });
}
type TestStore = ReturnType<typeof makeStore>;

async function mount(store: TestStore, element: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Provider store={store}>{element}</Provider>);
  });
  return {
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

/** Let pending promises and effects run (no timers are involved). */
async function settle(rounds = 10) {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** Wait on a real condition; the final assertion names what never happened. */
async function eventually<T>(read: () => T, expected: T) {
  for (let i = 0; i < 100; i += 1) {
    if (JSON.stringify(read()) === JSON.stringify(expected)) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
  expect(read()).toEqual(expected);
}

describe("StudioRoute", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    jest.mocked(fetchTranscriptById).mockResolvedValue(transcript);
    jest.mocked(promoteTranscriptToStudio).mockResolvedValue(promoted);
    jest.mocked(listSessions).mockResolvedValue([]);
    jest.mocked(listRawSegments).mockResolvedValue([]);
    jest.spyOn(toast, "error");
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("transcript import", () => {
    it("promotes the linked transcript exactly once for the signed-in user and replaces the import URL", async () => {
      const store = makeStore();
      store.dispatch(
        setUserAuth({ id: USER_ID, email: "expert@example.com" }),
      );

      const view = await mount(
        store,
        <StrictMode>
          <StudioRoute importTranscriptId={TRANSCRIPT_ID} />
        </StrictMode>,
      );
      await eventually(() => mockRouterReplace.mock.calls, [
        [`/transcripts/studio?session=${PROMOTED_SESSION_ID}`],
      ]);
      await settle();

      expect(promoteTranscriptToStudio).toHaveBeenCalledTimes(1);
      expect(promoteTranscriptToStudio).toHaveBeenCalledWith({
        transcript,
        userId: USER_ID,
      });
      expect(mockRouterPush).not.toHaveBeenCalled();
      await view.unmount();
    });

    it("tells the user an unavailable transcript cannot be imported and writes nothing", async () => {
      jest.mocked(fetchTranscriptById).mockResolvedValue(null);
      const store = makeStore();
      store.dispatch(setUserAuth({ id: USER_ID }));

      const view = await mount(
        store,
        <StudioRoute importTranscriptId={TRANSCRIPT_ID} />,
      );
      await eventually(
        () => jest.mocked(toast.error).mock.calls.map((call) => call[0]),
        [UNAVAILABLE_MESSAGE],
      );
      await settle();

      expect(promoteTranscriptToStudio).not.toHaveBeenCalled();
      expect(mockRouterReplace).not.toHaveBeenCalled();
      await view.unmount();
    });

    it("waits for the signed-in user before importing, then imports as that user", async () => {
      const store = makeStore();

      const view = await mount(
        store,
        <StudioRoute importTranscriptId={TRANSCRIPT_ID} />,
      );
      await settle();
      expect(fetchTranscriptById).not.toHaveBeenCalled();

      await act(async () => {
        store.dispatch(setUserAuth({ id: USER_ID }));
      });
      await eventually(
        () => jest.mocked(promoteTranscriptToStudio).mock.calls,
        [[{ transcript, userId: USER_ID }]],
      );
      await view.unmount();
    });

    it("does not navigate when the page is left while the promotion is still running", async () => {
      let finishPromotion: (result: PromoteToStudioResult) => void = () =>
        undefined;
      jest.mocked(promoteTranscriptToStudio).mockReturnValue(
        new Promise<PromoteToStudioResult>((resolve) => {
          finishPromotion = resolve;
        }),
      );
      const store = makeStore();
      store.dispatch(setUserAuth({ id: USER_ID }));

      const view = await mount(
        store,
        <StudioRoute importTranscriptId={TRANSCRIPT_ID} />,
      );
      await eventually(
        () => jest.mocked(promoteTranscriptToStudio).mock.calls.length,
        1,
      );
      await view.unmount();

      finishPromotion(promoted);
      await eventually(
        () => jest.mocked(listRawSegments).mock.calls,
        [[PROMOTED_SESSION_ID]],
      );
      await settle();

      expect(mockRouterReplace).not.toHaveBeenCalled();
    });
  });

  describe("studio session", () => {
    it("opens the server-provided session on first render", async () => {
      const store = makeStore();
      store.dispatch(sessionsListLoaded([studioSession(SERVER_SESSION_ID)]));

      const view = await mount(
        store,
        <StudioRoute initialSessionId={SERVER_SESSION_ID} />,
      );

      await eventually(
        () => store.getState().transcriptStudio.activeSessionId,
        SERVER_SESSION_ID,
      );
      expect(fetchTranscriptById).not.toHaveBeenCalled();
      await view.unmount();
    });

    it("follows the page URL's ?session= because the route mounts the studio in page mode", async () => {
      mockSearchParams = new URLSearchParams({ session: URL_SESSION_ID });
      const store = makeStore();
      store.dispatch(sessionsListLoaded([studioSession(URL_SESSION_ID)]));

      const view = await mount(store, <StudioRoute />);

      await eventually(
        () => store.getState().transcriptStudio.activeSessionId,
        URL_SESSION_ID,
      );
      await view.unmount();
    });
  });
});
