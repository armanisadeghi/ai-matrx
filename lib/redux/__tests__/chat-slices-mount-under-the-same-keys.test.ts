/**
 * THE CHAT STORE CONTRACT IS MOUNTED, NOT RE-WIRED (PACKAGE-INDEPENDENCE.md §2.2, slice P2).
 *
 * `@ai-matrx/chat` exports `chatReducers`, `chatMiddlewares()` and `chatSagas()`; the host's
 * root reducer, store and root saga mount them instead of importing each slice/middleware one
 * by one. This proves the mount changed nothing:
 *   - the 38 chat slices sit under today's exact top-level keys, with the package's reducers
 *     (a renamed key would orphan persisted caches and every `state.<key>` reader);
 *   - the six chat middlewares run in today's order, as one contiguous run at today's position
 *     (order drift once lost `inboxTurnEnd` — W-34);
 *   - the host root saga forks `watchDefinitionChanges` (builder tier, outside the package since P25).
 * It does NOT prove a private store runs a turn — that is P24g.
 */

import { readAppChatPreferences } from "@/lib/redux/chat-host-from-app";
import type { ConfigureStoreOptions, Middleware } from "@reduxjs/toolkit";

const captured: { options: ConfigureStoreOptions | null } = { options: null };

jest.mock("@reduxjs/toolkit", () => {
  const actual = jest.requireActual("@reduxjs/toolkit");
  return {
    ...actual,
    configureStore: (options: ConfigureStoreOptions) => {
      captured.options = options;
      return actual.configureStore(options);
    },
  };
});

import { Tuple } from "@reduxjs/toolkit";
import { makeStore } from "@/lib/redux/store";
import { slimReducerMap } from "@/lib/redux/rootReducer";
import { chatReducers } from "@ai-matrx/chat/store/slices";
import { agentDefinitionWithBuilderReducer } from "@/features/agents/redux/agent-builder.slice";
import { chatMiddlewares } from "@ai-matrx/chat/store/middlewares";
import { chatSagas } from "@ai-matrx/chat/store/sagas";
import { agentCacheBustMiddleware } from "@ai-matrx/chat/agents/redux/agent-definition/cache-bust-middleware";
import { composerDraftMiddleware } from "@ai-matrx/chat/agents/redux/execution-system/instance-user-input/composer-draft.middleware";
import { unsentLaunchMiddleware } from "@ai-matrx/chat/agents/redux/execution-system/instance-user-input/unsent-launch.middleware";
import { inboxTurnEndMiddleware } from "@ai-matrx/chat/agents/redux/execution-system/inbox/inbox-turn-end.middleware";
import { launchHandleReleaseMiddleware } from "@ai-matrx/chat/agents/redux/execution-system/instance-ui-state/launch-handle-release.middleware";
import { runConfigurationPersistMiddleware } from "@ai-matrx/chat/agents/redux/execution-system/instance-ui-state/run-configuration-persist";
import { createSlimRootSaga } from "@/lib/redux/sagas/rootSaga";
import { watchDefinitionChanges } from "@/features/agents/redux/sagas/syncDefinitionToInstances.saga";
import { pdfStudioPersistenceMiddleware } from "@/features/pdf-extractor/state/persistence";
import { mandateOrgSwitchCacheMiddleware } from "@/features/mandates/redux/org-switch-cache-middleware";

/** The top-level keys the host mounted chat slices under before P2 (rootReducer.ts, 2026-10-01). */
const CHAT_KEYS_BEFORE_P2 = [
  "voiceAgent",
  "agentDefinition",
  "conversationList",
  "conversationHistory",
  "agentShortcut",
  "agentShortcutCategory",
  "surfaceUserState",
  "tools",
  "conversations",
  "chatIncognito",
  "chatRoute",
  "instanceModelOverrides",
  "instanceInputCapabilities",
  "instanceVariableValues",
  "instanceResources",
  "instanceContext",
  "instanceWorkingDocument",
  "instanceUserInput",
  "instanceClientTools",
  "pendingAsks",
  "conversationInbox",
  "agentLists",
  "instanceUIState",
  "activeTools",
  "activeRequests",
  "runSets",
  "messages",
  "observability",
  "contextState",
  "observationalMemory",
  "cacheBypass",
  "conversationFocus",
  "surfaces",
  "surfacesCatalog",
  "agentSurfaceBindings",
  "surfaceConfig",
  "agentAssistantMarkdownDraft",
  "mcp",
];

/** Keys the package added since P2 (none existed in the host before): P3's synced host state. */
const CHAT_KEYS_ADDED = ["chatHost"];

/**
 * Host keys whose slice moved INTO the package since P2 (P17b, P17), under the SAME key: the host
 * no longer imports these reducers itself, it mounts them through `...chatReducers`.
 */
// conversationAttachments, modelRegistry: moved in deliberately by 9e363c01e5 (P17b).
const CHAT_KEYS_MOVED_IN = ["proposedDirectives", "agentSettings", "conversationAttachments", "modelRegistry"];

const ALL_CHAT_KEYS = [...CHAT_KEYS_BEFORE_P2, ...CHAT_KEYS_ADDED, ...CHAT_KEYS_MOVED_IN];

/** The chat middlewares in the order store.ts ran them before P2. */
const CHAT_MIDDLEWARES_BEFORE_P2: Middleware[] = [
  agentCacheBustMiddleware,
  composerDraftMiddleware,
  unsentLaunchMiddleware,
  inboxTurnEndMiddleware,
  launchHandleReleaseMiddleware,
  runConfigurationPersistMiddleware,
];

describe("chat slices mount under the same keys", () => {
  it("exports exactly today's 38 chat keys, plus the keys added or moved in since", () => {
    expect(Object.keys(chatReducers).sort()).toEqual(
      [...ALL_CHAT_KEYS].sort(),
    );
  });

  it("the host root reducer mounts every chat key with the package's own reducer", () => {
    const hostMap = slimReducerMap as Record<string, unknown>;
    for (const key of ALL_CHAT_KEYS) {
      const mounted = hostMap[key];
      expect({ key, mounted: typeof mounted }).toEqual({ key, mounted: "function" });
      // agentDefinition is the one key the app composes on: the builder's edit reducers
      // (agentBuilder/*) run over chat's record (AGENT-CORE-PLAN B2), so it is checked below.
      if (key === "agentDefinition") continue;
      expect({ key, same: mounted === (chatReducers as Record<string, unknown>)[key] }).toEqual({
        key,
        same: true,
      });
    }
  });

  it("agentDefinition is chat's reducer with the builder's edits composed on, nothing else", () => {
    const mounted = (slimReducerMap as Record<string, unknown>).agentDefinition;
    expect(mounted).toBe(agentDefinitionWithBuilderReducer);
    const probe = { type: "@@chat-p2/probe" };
    expect(agentDefinitionWithBuilderReducer(undefined, probe)).toEqual(
      (chatReducers.agentDefinition as (s: unknown, a: { type: string }) => unknown)(undefined, probe),
    );
  });

  it("a built store holds every chat key, initialised by the chat reducer", () => {
    const store = makeStore();
    const state = store.getState() as unknown as Record<string, unknown>;
    for (const key of ALL_CHAT_KEYS) {
      const reducer = (chatReducers as Record<string, (s: unknown, a: { type: string }) => unknown>)[key];
      const initial = reducer(undefined, { type: "@@chat-p2/probe" }) as Record<string, unknown>;
      // chatHost.preferences is this app's preferences from the first reduction (P8), not the
      // package default (this app's preferences have not loaded yet; the default says loaded).
      const expected =
        key === "chatHost"
          ? { ...initial, preferences: readAppChatPreferences(state as never) }
          : initial;
      expect({ key, state: state[key] }).toEqual({ key, state: expected });
    }
  });
});

describe("chat middlewares keep their order and position", () => {
  it("chatMiddlewares() is today's six, in today's order", () => {
    const list = chatMiddlewares();
    expect(list).toHaveLength(CHAT_MIDDLEWARES_BEFORE_P2.length);
    list.forEach((mw, i) => expect(mw).toBe(CHAT_MIDDLEWARES_BEFORE_P2[i]));
    list.forEach((mw) => expect(typeof mw).toBe("function"));
  });

  it("the host store runs them as one contiguous run between pdfStudio persistence and the mandate org-switch cache", () => {
    captured.options = null;
    makeStore();
    const options = captured.options as ConfigureStoreOptions | null;
    expect(options).not.toBeNull();
    const build = options!.middleware as unknown as (gdm: () => Tuple<Middleware[]>) => Middleware[];
    const chain = Array.from(build(() => new Tuple<Middleware[]>()));

    const at = CHAT_MIDDLEWARES_BEFORE_P2.map((mw) => chain.indexOf(mw));
    at.forEach((index) => expect(index).toBeGreaterThanOrEqual(0));
    at.forEach((index, i) => {
      if (i > 0) expect(index).toBe(at[i - 1] + 1);
    });
    expect(chain[at[0] - 1]).toBe(pdfStudioPersistenceMiddleware);
    expect(chain[at[at.length - 1] + 1]).toBe(mandateOrgSwitchCacheMiddleware);
    // Mounted once — never twice.
    for (const mw of CHAT_MIDDLEWARES_BEFORE_P2) {
      expect(chain.filter((m) => m === mw)).toHaveLength(1);
    }
  });
});

describe("chat sagas", () => {
  // P25: the definition-sync saga is builder-tier — it left the package and the
  // HOST root saga forks it; the package forks no saga of its own.
  it("chatSagas() is empty and the host root saga forks watchDefinitionChanges", () => {
    expect(chatSagas()).toEqual([]);
    const allEffect = createSlimRootSaga()().next().value as {
      payload: { payload: { fn: unknown } }[];
    };
    const forked = allEffect.payload.map((e) => e.payload.fn);
    expect(forked).toEqual([watchDefinitionChanges]);
  });
});
