/**
 * RC-B6 — the /chat bar and the proving route (/markdown-studio) offer the SAME
 * actions for the same assistant message.
 *
 * Both sides are the real surfaces' own wiring:
 *   - chat: the /chat assistant footer's bar (<RichDocumentActions/>, the
 *     same hook as every bar) fed by `buildChatMessageActions` exactly as
 *     AssistantMessageFooter builds it, with its dialogs host's callbacks;
 *   - studio: the real studio loader (`STUDIO_SOURCES["chat-message"].load`,
 *     reading the message row) rendered through the real <RichDocument
 *     actionsVariant="remote"/> that PreviewPanel mounts; the set is what the
 *     studio's header bar receives from the remote-surface registry.
 *
 * The studio holds a READ-ONLY copy, so the allowed differences are exactly:
 * every action that writes the source (edit, delete, fork, pin, regenerate,
 * apply…) — absent there because the source is read-only — plus what only the
 * chat host knows (the full-page print capture). Nothing else may differ. Before RC-B6 the studio excluded every write-back action
 * and the chat menu was a separate 2,489-line registry, so the sets diverged
 * by more than a dozen actions.
 */

const ROW = {
  id: "msg-2",
  conversation_id: "conv-1",
  role: "assistant",
  created_at: "2026-09-24T10:00:00Z",
  metadata: null,
  content: [
    {
      type: "text",
      text: [
        "Here is the refund policy.",
        "",
        "| Tier | Window |",
        "| --- | --- |",
        "| Gold | 60 days |",
        "",
        "```ts",
        "const ok = true;",
        "```",
      ].join("\n"),
    },
  ],
};

jest.mock("@/utils/supabase/client", () => {
  const chain = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    maybeSingle: async () => ({ data: ROW, error: null }),
  };
  return { supabase: { schema: () => chain } };
});
jest.mock("next/dynamic", () => () => () => null);
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));


import React, { act } from "react";
import { Provider } from "react-redux";
import { configureStore, type UnknownAction } from "@reduxjs/toolkit";
import { createRoot } from "react-dom/client";
import { enableMapSet } from "immer";
import { createSlimRootReducer, type RootState } from "@/lib/redux/rootReducer";
import { STUDIO_SOURCES } from "@/components/markdown-studio/lab/content-sources";
import { RichDocument } from "../RichDocument";
import { RichDocumentActionProvider } from "../RichDocumentActionProvider";
import { buildChatMessageActions } from "../chat/chatMessageActions";
import { getAction } from "../actions/registry";
import { hydrateMessages } from "@/features/agents/redux/execution-system/messages/messages.slice";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
enableMapSet();

const HOST_ONLY_ACTIONS = ["full-print"];
const CHAT_SURFACE = "chat-parity-test";
const SURFACE = "studio-parity-test";

function makeStore() {
  const reducer = createSlimRootReducer();
  const seeded = (state: RootState | undefined, action: UnknownAction) => {
    const next = reducer(state, action);
    return action.type === "test/seed"
      ? {
          ...next,
          userAuth: {
            ...next.userAuth,
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            authReady: true,
            adminLevel: "super_admin" as const,
            isAdmin: true,
          },
        }
      : next;
  };
  const store = configureStore({
    reducer: seeded as never,
    middleware: (gdm) => gdm({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch({ type: "test/seed" });
  // The chat bar renders for a LOADED row (Edit needs the row's spot on screen).
  store.dispatch(
    hydrateMessages({
      conversationId: "conv-1",
      messages: [
        {
          id: "msg-2",
          conversationId: "conv-1",
          agentId: null,
          role: "assistant",
          content: [{ type: "text", text: "answer" }],
          contentHistory: null,
          userContent: null,
          position: 1,
          source: "server",
          status: "active",
          isVisibleToModel: true,
          isVisibleToUser: true,
          metadata: {},
          createdAt: "2026-09-25T00:00:00.000Z",
          deletedAt: null,
        },
      ],
    }),
  );
  return store;
}

function specIds(state: RootState, surfaceId: string): Set<string> {
  const stack = state.richDocumentActionSurfaces.bySurfaceId[surfaceId];
  return new Set(
    (stack?.[stack.length - 1]?.computedActionSpecs ?? []).map((s) => s.id),
  );
}

it("the chat bar and the studio bar carry the same actions for one assistant message", async () => {
  const store = makeStore();
  const loaded = await STUDIO_SOURCES["chat-message"].load("msg-2");
  const noop = () => {};

  // What AssistantMessageFooter builds for this message (the chat host owns the
  // delete / history / print / convert dialogs).
  const chat = buildChatMessageActions({
    conversationId: "conv-1",
    messageId: "msg-2",
    role: "assistant",
    messageContent: loaded.content,
    metadata: null,
    contentHistoryCount: 1,
    surfaceKey: "chat-page",
    showFullPrint: true,
    callbacks: {
      onFullPrint: noop,
      onRequestDelete: noop,
      onRequestEditHistory: noop,
      onRequestConvert: noop,
      // The chat bar hosts the same document dialogs RichDocument does.
      onRequestSaveTable: noop,
      onRequestFlashcard: noop,
      onRequestTextAgentAction: noop,
    },
  });

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Provider store={store}>
        <RichDocumentActionProvider
          surfaceId={CHAT_SURFACE}
          content={chat.content}
          source={chat.source}
          actions={chat.actions}
        />
        {/* PreviewPanel's exact mount for a loaded source. */}
        <RichDocument
          content={loaded.content}
          source={{ ...loaded.contentSource, readOnly: true }}
          actionsVariant="remote"
          actionsSurfaceId={SURFACE}
          actions={loaded.sourceActions}
          enableContextMenu
          hideCopyButton
          allowFullScreenEditor={false}
        />
      </Provider>,
    );
  });

  const state = store.getState() as RootState;
  const chatSet = specIds(state, CHAT_SURFACE);
  const studioSet = specIds(state, SURFACE);

  // Sanity: both surfaces really rendered the migrated doors.
  for (const id of [
    "add-to-rulebook",
    "summarize-and-listen",
    "save-to-notes",
    "convert-to-study",
    "thumbs-up",
    "tts-play",
    "copy-table-csv",
  ]) {
    expect(chatSet.has(id)).toBe(true);
    expect(studioSet.has(id)).toBe(true);
  }
  // The read-only copy offers NOTHING that writes the source.
  for (const id of studioSet) expect(getAction(id)?.writesSource ?? false).toBe(false);
  for (const id of ["edit", "delete-message", "fork-at-message", "text-cleanup"]) {
    expect(chatSet.has(id)).toBe(true);
    expect(studioSet.has(id)).toBe(false);
  }

  const onlyInChat = [...chatSet].filter((id) => !studioSet.has(id)).sort();
  const onlyInStudio = [...studioSet].filter((id) => !chatSet.has(id)).sort();
  expect(onlyInStudio).toEqual([]);
  const writers = onlyInChat.filter((id) => getAction(id)?.writesSource);
  expect(onlyInChat.filter((id) => !writers.includes(id))).toEqual(
    [...HOST_ONLY_ACTIONS].sort(),
  );

  await act(async () => root.unmount());
  container.remove();
});
