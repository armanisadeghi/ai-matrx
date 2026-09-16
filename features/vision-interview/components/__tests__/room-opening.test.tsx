/**
 * THE FIRST FIVE SECONDS OF THE VISION INTERVIEW ROOM.
 *
 * Two defects a cold first-time walk found, both about the same promise —
 * the screen knows who is here and what you already said — and both guarded
 * here against the REAL `RoomChatPane`, the REAL vision-interview slice and
 * the REAL agent-execution slices.
 *
 * ── The breaks these tests name ────────────────────────────────────────────
 *
 * 1. THE GENERIC HERO. Remove the `<RoleHeroIdentity>` mount from
 *    `RoomChatPane` (or hardcode one string for all six experts) and the
 *    conversation's `instanceUIState` carries no `display*Override`. The
 *    canonical empty state then falls back to its own defaults —
 *    `AgentEmptyMessageDisplay` line 83 prints "Ready to run" and line 95
 *    prints "Type a message below to start." over a wireframe glyph. The
 *    assertions below are on the exact three fields that consumer reads
 *    (lines 32-46), for TWO different experts with two different expected
 *    values, so a single hardcoded string cannot satisfy them.
 *
 * 2. THE DROPPED OPENING. Remove the `<OpeningVisionSend>` mount (the
 *    pre-fix behaviour: `createSession` wrote `vision_statement` and nothing
 *    in `features/` or `app/` ever read it back into a conversation) and the
 *    canonical send thunk is never dispatched — the lead expert opens on an
 *    empty room and greets a context-free interview. Re-send it on a
 *    re-render, a role-tab switch or a room that has already been spoken in
 *    and the person's vision is delivered twice, which is worse.
 *
 * ── What is stubbed, and why it cannot hide a break ───────────────────────
 * `ChatRoomClient` (the whole chat surface — not the subject; its empty-state
 * consumer is asserted through the store fields it reads) and `smartExecute`
 * (the network turn). The stub records what the room asked for and then does
 * what a started turn really does — flips the conversation to `running` —
 * so "the send started" is never something the harness simply asserts into
 * existence. Everything that decides IF, WHEN, WITH WHAT and HOW OFTEN is
 * the real component against the real reducers.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import visionInterviewReducer, {
  activeRoleTabChanged,
  roomOpened,
  sessionMerged,
} from "../../redux/vision-interview.slice";
import { ROLES } from "../../types";
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
import { RoomChatPane } from "../RoomChatPane";
import { __resetOpeningSentMarks } from "../RoomOpening";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));

/** Not the subject: the chat surface itself. Its empty-state hero is asserted
 *  through the exact store fields `AgentEmptyMessageDisplay` reads. */
jest.mock("@/features/agents/components/chat/ChatRoomClient", () => ({
  ChatRoomClient: () => null,
}));

/** Not the subject: reporting a finished exchange to the Scribe. */
jest.mock("../../hooks/useObserveRoleTurns", () => ({
  useObserveRoleTurns: () => {},
}));

interface SendRecord {
  conversationId: string;
  surfaceKey?: string;
  /** What was staged on the instance at the moment the send fired. */
  textAtSend: string;
}
const mockSends: SendRecord[] = [];
/** `"starts"` — the turn really begins (the room flips to running, exactly as
 *  a real send does). `"never-starts"` — the thunk returns without executing,
 *  which is what a duplicate claim, a lost instance or a declined
 *  organization gate really look like: `smartExecute` is a `createAsyncThunk`
 *  and never rejects the dispatched promise. */
const mockBehaviour = { mode: "starts" as "starts" | "never-starts" };

jest.mock(
  "@/features/agents/redux/execution-system/thunks/smart-execute.thunk",
  () => ({
    smartExecute:
      (args: { conversationId: string; surfaceKey?: string }) =>
      async (
        dispatch: (action: unknown) => unknown,
        getState: () => {
          instanceUserInput: {
            byConversationId: Record<string, { text: string }>;
          };
        },
      ) => {
        mockSends.push({
          conversationId: args.conversationId,
          surfaceKey: args.surfaceKey,
          textAtSend:
            getState().instanceUserInput.byConversationId[args.conversationId]
              ?.text ?? "",
        });
        if (mockBehaviour.mode === "never-starts") return;
        const {
          setInstanceStatus,
          // eslint-disable-next-line @typescript-eslint/no-require-imports
        } = require("@/features/agents/redux/execution-system/conversations/conversations.slice");
        dispatch(
          setInstanceStatus({
            conversationId: args.conversationId,
            status: "running",
          }),
        );
      },
  }),
);

const SESSION_ID = "6e1d2b7a-1a9f-4b2e-9d9b-2f5e0f4c1a33";
const LEAD_AGENT = "f0a1c2d3-4e5f-4a6b-8c9d-0e1f2a3b4c5d";
const LEAD_CONVERSATION = "11111111-2222-4333-8444-555555555555";
const ADVERSARY_AGENT = "a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5e";
const ADVERSARY_CONVERSATION = "99999999-8888-4777-8666-555555555555";

/** What the person actually typed into "What do you see?". */
const VISION =
  "We pick up recycling from two hundred apartment buildings and half of " +
  "what we collect is contaminated before the truck even arrives. I want " +
  "the building managers to know, the same day, which chute went wrong.";

function makeSession({
  visionStatement,
  leadStarted,
}: {
  visionStatement: string | null;
  leadStarted: boolean;
}) {
  return {
    id: SESSION_ID,
    title: "Contamination, building by building",
    stage: "capture",
    current_round: 1,
    vision_statement: visionStatement,
    role_bindings: {
      sounding_board: {
        agent_id: LEAD_AGENT,
        conversation_id: LEAD_CONVERSATION,
        conversation_started: leadStarted,
      },
      adversary: {
        agent_id: ADVERSARY_AGENT,
        conversation_id: ADVERSARY_CONVERSATION,
        conversation_started: true,
      },
    },
    document: "",
    vision_document: null,
    requirements_document: null,
    cleaned_transcript: null,
    finalized_at: null,
    updated_at: "2026-09-16T00:00:00.000Z",
  };
}

type Store = ReturnType<typeof makeStore>;

function makeStore(session: ReturnType<typeof makeSession>) {
  const store = configureStore({
    reducer: {
      visionInterview: visionInterviewReducer,
      instanceUIState: instanceUIStateReducer,
      instanceUserInput: instanceUserInputReducer,
      instanceContext: instanceContextReducer,
      conversations: conversationsReducer,
      messages: messagesReducer,
      activeRequests: activeRequestsReducer,
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
  store.dispatch(roomOpened({ sessionId: SESSION_ID }));
  store.dispatch(sessionMerged(session as never));
  // What the chat's launcher does when a room's conversation comes up: both
  // tabs' instances exist, so the room is READY to be spoken in.
  for (const [conversationId, agentId] of [
    [LEAD_CONVERSATION, LEAD_AGENT],
    [ADVERSARY_CONVERSATION, ADVERSARY_AGENT],
  ] as const) {
    store.dispatch(createInstance({ conversationId, agentId } as never));
    store.dispatch(initInstanceUIState({ conversationId } as never));
    store.dispatch(initInstanceUserInput({ conversationId }));
  }
  return store;
}

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

/** The three fields `AgentEmptyMessageDisplay` reads before it falls back to
 *  "Ready to run" / "Type a message below to start." / the Webhook glyph. */
function hero(store: Store, conversationId: string) {
  const entry = store.getState().instanceUIState.byConversationId[
    conversationId
  ] as
    | {
        displayNameOverride?: string | null;
        displayDescriptionOverride?: string | null;
        displayIconNameOverride?: string | null;
      }
    | undefined;
  return {
    name: entry?.displayNameOverride ?? null,
    description: entry?.displayDescriptionOverride ?? null,
    iconName: entry?.displayIconNameOverride ?? null,
  };
}

beforeEach(() => {
  mockSends.length = 0;
  mockBehaviour.mode = "starts";
  __resetOpeningSentMarks();
  try {
    window.sessionStorage.clear();
  } catch {
    /* jsdom always has it; a denied store is handled in the component */
  }
});

afterEach(unmount);

describe("the room says who is in it", () => {
  it("opens on the ACTIVE expert's own name, first words and icon", async () => {
    const store = makeStore(
      makeSession({ visionStatement: null, leadStarted: true }),
    );
    await mount(store);

    expect(hero(store, LEAD_CONVERSATION)).toEqual({
      name: "Sounding Board",
      description: ROLES.sounding_board.opening,
      iconName: "Ear",
    });
    // Belt and braces on the actual defect: the generic hero's words are what
    // a missing override produces, and they must not be what is on screen.
    expect(hero(store, LEAD_CONVERSATION).name).not.toBe("Ready to run");
  });

  it("switching experts changes them — six experts are never one string", async () => {
    const store = makeStore(
      makeSession({ visionStatement: null, leadStarted: true }),
    );
    await mount(store);
    await act(async () => {
      // The action both the desktop stage tabs and the phone bar dispatch.
      store.dispatch(activeRoleTabChanged("adversary"));
    });

    // A SECOND forcing input with a DIFFERENT expected value: one hardcoded
    // hero for the whole room cannot pass both cases.
    expect(hero(store, ADVERSARY_CONVERSATION)).toEqual({
      name: "Adversary",
      description: ROLES.adversary.opening,
      iconName: "Swords",
    });
    expect(ROLES.adversary.opening).not.toBe(ROLES.sounding_board.opening);
  });
});

describe("the opening vision reaches the lead expert", () => {
  it("is sent, once, as the first turn — through the canonical send path", async () => {
    const store = makeStore(
      makeSession({ visionStatement: VISION, leadStarted: false }),
    );
    await mount(store);

    expect(mockSends).toHaveLength(1);
    expect(mockSends[0].conversationId).toBe(LEAD_CONVERSATION);
    // The chat surface's own key — the same one the composer's send carries.
    expect(mockSends[0].surfaceKey).toBe(`chat:${LEAD_AGENT}`);
    // The person's words, not a canned greeting and not an empty turn.
    expect(mockSends[0].textAtSend).toBe(VISION);
  });

  it("does not send again on a re-render, a role switch, or a remount", async () => {
    const session = makeSession({
      visionStatement: VISION,
      leadStarted: false,
    });
    const store = makeStore(session);
    await mount(store);
    expect(mockSends).toHaveLength(1);

    // A re-render carrying a fresh session object (realtime echoes the row on
    // every write) must not look like a new session.
    await act(async () => {
      store.dispatch(sessionMerged({ ...session } as never));
    });
    // Away to another expert and back.
    await act(async () => {
      store.dispatch(activeRoleTabChanged("adversary"));
    });
    await act(async () => {
      store.dispatch(activeRoleTabChanged("sounding_board"));
    });
    // And the whole room mounted again (SPA navigation away and back).
    unmount();
    await mount(store);
    expect(mockSends).toHaveLength(1);

    // THE RELOAD. Every scrap of Redux is gone — no messages, nothing
    // running, and the server has not had time to flip `conversation_started`
    // on the binding yet. Only the room's own per-session mark stands between
    // the person and their vision arriving a second time.
    unmount();
    const afterReload = makeStore(session);
    await mount(afterReload);

    expect(mockSends).toHaveLength(1);
  });

  it("never sends into a room that has already been spoken in", async () => {
    const store = makeStore(
      makeSession({ visionStatement: VISION, leadStarted: true }),
    );
    await mount(store);
    expect(mockSends).toHaveLength(0);
  });

  it("says so, with the words kept and a way to finish, when the send cannot start", async () => {
    mockBehaviour.mode = "never-starts";
    const store = makeStore(
      makeSession({ visionStatement: VISION, leadStarted: false }),
    );
    await mount(store);

    // A SCREEN NEVER LIES: no silent fall back to the canned greeting.
    const text = document.body.textContent ?? "";
    expect(text).toContain("could not hand your opening to Sounding Board");
    expect(text).toContain("Nothing is lost");
    // The words are back in the composer, so nothing has to be retyped.
    expect(
      store.getState().instanceUserInput.byConversationId[LEAD_CONVERSATION]
        ?.text,
    ).toBe(VISION);
    // And the one control that finishes the job is on screen.
    const retry = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Send my opening to Sounding Board"),
    );
    expect(retry).toBeDefined();
  });
});
