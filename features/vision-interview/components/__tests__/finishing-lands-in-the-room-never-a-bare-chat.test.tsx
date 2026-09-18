/**
 * FINISHING LANDS IN THE ROOM, NEVER IN A BARE CHAT — a forcing function.
 *
 * THE DEFECT (cold-walk-2, jobs-bar-2026-09-16, finding 3; screenshots in that
 * register). An Expert three rounds into the Vision Interview pressed the
 * room's own "Finish the interview" and then "Write the documents", and the
 * app answered by dropping her out of the guided room onto a plain
 * `/chat/<id>` thread — a DIFFERENT conversation, opening with the machine's
 * own briefing rendered as if it were what she had said. Two separate promises
 * broken in one click: the three documents the dialog names were never put in
 * front of her, and the room handed its URL away.
 *
 * Both halves are guarded here against the REAL `RoomChatPane` and the REAL
 * vision-interview slice.
 *
 *   1. THE LANDING. Remove the finalize effect and the room leaves the person
 *      exactly where she was when the documents arrive — in front of a chat
 *      tab, with three `Open` buttons in a dialog she has to notice. A promise
 *      kept only if you go looking for it is not kept.
 *
 *   2. THE URL. `ChatRoomClient` has two effects that call
 *      `router.replace(buildConversationHref(id))`, and the prop DEFAULTS to
 *      `/chat/<id>`. That default is correct for the chat route and
 *      catastrophic for an embedded room: it silently replaces a guided
 *      interview with a bare chat thread. Drop the prop from the room's mount
 *      and this file fails, naming the default it fell back to.
 *
 * What is stubbed: `ChatRoomClient` itself (not the subject — its props ARE
 * the subject of case 2, so the stub records them) and the Scribe observer.
 * Everything deciding IF and WHEN is the real component on the real reducer.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import visionInterviewReducer, {
  roomOpened,
  sessionMerged,
  selectDocView,
} from "../../redux/vision-interview.slice";
import instanceUIStateReducer, {
  initInstanceUIState,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import instanceUserInputReducer, {
  initInstanceUserInput,
} from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import instanceContextReducer from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import conversationsReducer, {
  createInstance,
} from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import messagesReducer from "@/features/agents/redux/execution-system/messages/messages.slice";
import activeRequestsReducer from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
// The document pane really renders once a record is open, and `RichDocument`
// reads the app context. Including the real slice is what lets these cases
// assert the landing against the component that actually draws it.
import appContextReducer from "@/lib/redux/slices/appContextSlice";
import { RoomChatPane } from "../RoomChatPane";
import { __resetOpeningSentMarks } from "../RoomOpening";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));

/** Not the subject — but its PROPS are, so the stub records every mount. */
const mountedChatProps: Array<Record<string, unknown>> = [];
jest.mock("@/features/agents/components/chat/ChatRoomClient", () => ({
  ChatRoomClient: (props: Record<string, unknown>) => {
    mountedChatProps.push(props);
    return null;
  },
}));

jest.mock("../../hooks/useObserveRoleTurns", () => ({
  useObserveRoleTurns: () => {},
}));

jest.mock(
  "@/features/agents/redux/execution-system/thunks/smart-execute.thunk",
  () => ({ smartExecute: () => async () => {} }),
);

const SESSION_ID = "6e1d2b7a-1a9f-4b2e-9d9b-2f5e0f4c1a33";
const LEAD_AGENT = "f0a1c2d3-4e5f-4a6b-8c9d-0e1f2a3b4c5d";
const LEAD_CONVERSATION = "11111111-2222-4333-8444-555555555555";

function makeSession(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: SESSION_ID,
    title: "Contamination, building by building",
    stage: "capture",
    current_round: 1,
    // Already spoken in — this walk was three rounds deep when it pressed
    // Finish, so the opening auto-send is not in play here.
    vision_statement: null,
    role_bindings: {
      sounding_board: {
        agent_id: LEAD_AGENT,
        conversation_id: LEAD_CONVERSATION,
        conversation_started: true,
      },
    },
    document: "",
    vision_document: null,
    requirements_document: null,
    cleaned_transcript: null,
    finalized_at: null,
    updated_at: "2026-09-16T00:00:00.000Z",
    ...overrides,
  };
}

/** What `interview.finalize` actually writes, arriving over realtime. */
const FINALIZED = {
  vision_document: "# Vision\n\nSame-day contamination reports per chute.",
  requirements_document: "# Requirements\n\n1. One report per building.",
  cleaned_transcript: "# Transcript\n\nExpert: half of it is contaminated…",
  finalized_at: "2026-09-16T01:00:00.000Z",
  updated_at: "2026-09-16T01:00:00.000Z",
};

function makeStore() {
  const store = configureStore({
    reducer: {
      visionInterview: visionInterviewReducer,
      instanceUIState: instanceUIStateReducer,
      instanceUserInput: instanceUserInputReducer,
      instanceContext: instanceContextReducer,
      conversations: conversationsReducer,
      messages: messagesReducer,
      activeRequests: activeRequestsReducer,
      appContext: appContextReducer,
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
  store.dispatch(roomOpened({ sessionId: SESSION_ID }));
  store.dispatch(sessionMerged(makeSession() as never));
  store.dispatch(
    createInstance({
      conversationId: LEAD_CONVERSATION,
      agentId: LEAD_AGENT,
    } as never),
  );
  store.dispatch(
    initInstanceUIState({ conversationId: LEAD_CONVERSATION } as never),
  );
  store.dispatch(initInstanceUserInput({ conversationId: LEAD_CONVERSATION }));
  return store;
}

type Store = ReturnType<typeof makeStore>;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(store: Store) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <Provider store={store}>
        <RoomChatPane
          onGotoStage={() => {}}
          onRetryRoles={() => {}}
          onAdvanceStage={async () => {}}
        />
      </Provider>,
    );
  });
}

function unmount() {
  if (!root) return;
  act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
}

beforeEach(() => {
  mountedChatProps.length = 0;
  __resetOpeningSentMarks();
  try {
    window.sessionStorage.clear();
  } catch {
    /* jsdom always has it */
  }
});
afterEach(unmount);

describe("the documents the room promised are put in front of her", () => {
  it("opens the Vision document the moment the interview is finalized", async () => {
    const store = makeStore();
    await mount(store);
    expect(selectDocView(store.getState() as never)).toBeNull();

    await act(async () => {
      store.dispatch(sessionMerged(makeSession(FINALIZED) as never));
    });

    expect(selectDocView(store.getState() as never)).toBe("vision");
  });

  it("does not open a blank: a finalize that wrote nothing lands on nothing", async () => {
    // A server-side failure writes the stamp with no documents. Opening an
    // empty record would be a screen claiming work that does not exist; the
    // finish dialog is the surface that says what went wrong.
    const store = makeStore();
    await mount(store);

    await act(async () => {
      store.dispatch(
        sessionMerged(
          makeSession({
            finalized_at: FINALIZED.finalized_at,
            updated_at: FINALIZED.updated_at,
          }) as never,
        ),
      );
    });

    expect(selectDocView(store.getState() as never)).toBeNull();
  });

  it("does not drag her back when she then opens a different record", async () => {
    const store = makeStore();
    await mount(store);
    await act(async () => {
      store.dispatch(sessionMerged(makeSession(FINALIZED) as never));
    });
    expect(selectDocView(store.getState() as never)).toBe("vision");

    // She picks the transcript, and the session row updates again (realtime
    // echoes, a later edit) with the SAME finalize stamp.
    const { docViewChanged } = jest.requireActual(
      "../../redux/vision-interview.slice",
    ) as { docViewChanged: (v: string) => unknown };
    await act(async () => {
      store.dispatch(docViewChanged("transcript") as never);
      store.dispatch(
        sessionMerged(
          makeSession({
            ...FINALIZED,
            updated_at: "2026-09-16T02:00:00Z",
          }) as never,
        ),
      );
    });

    expect(selectDocView(store.getState() as never)).toBe("transcript");
  });
});

describe("the room never hands its URL to a bare chat", () => {
  it("mounts the chat with the ROOM's own href, not /chat/<id>", async () => {
    const store = makeStore();
    await mount(store);

    const props = mountedChatProps.at(-1);
    expect(props).toBeDefined();
    const build = props?.buildConversationHref as
      ((id: string) => string) | undefined;
    // Missing entirely = `ChatRoomClient`'s default, which is `/chat/<id>`.
    expect(typeof build).toBe("function");
    const href = build!("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(href).toBe(`/masterwork/vision-interview/${SESSION_ID}`);
    expect(href.startsWith("/chat/")).toBe(false);
  });
});

/**
 * THE CENSUS. `ChatRoomClient` is a whole conversation surface that any page
 * may embed, and its navigation default belongs to exactly one of them. Every
 * mount OUTSIDE `app/(core)/chat` owns its own URL and must say so.
 */
describe("every embedded conversation surface declares its own URL", () => {
  const { readFileSync, readdirSync, statSync } = jest.requireActual(
    "node:fs",
  ) as typeof import("node:fs");
  const { join } = jest.requireActual(
    "node:path",
  ) as typeof import("node:path");
  const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next" || entry === ".git")
        continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.tsx$/.test(full) && !full.includes("__tests__"))
        out.push(full);
    }
    return out;
  }

  it("no mount outside the chat route falls back to /chat/<id>", () => {
    const offenders: string[] = [];
    for (const dir of ["features", "app", "components"]) {
      for (const file of walk(join(REPO_ROOT, dir))) {
        const source = readFileSync(file, "utf8");
        const mount = source.indexOf("<ChatRoomClient");
        if (mount === -1) continue;
        const relative = file.slice(REPO_ROOT.length + 1);
        // The chat route IS the default's owner.
        if (relative.startsWith("app/(core)/chat/")) continue;
        if (relative.startsWith("features/agents/components/chat/")) continue;
        // Read to the end of the JSX element, not the file.
        const end = source.indexOf("/>", mount);
        const element = source.slice(mount, end === -1 ? undefined : end);
        if (!element.includes("buildConversationHref"))
          offenders.push(relative);
      }
    }
    expect(offenders).toEqual([]);
  });
});
