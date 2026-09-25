/**
 * RC-B6 — the /chat bar and the proving route (/markdown-studio) offer the SAME
 * actions for the same assistant message.
 *
 * Both sides are the real surfaces' own wiring:
 *   - chat: the ⋯ menu the /chat assistant bar mounts (`RegistryActionMenu`,
 *     fed by `buildChatMessageActions` exactly as AssistantActionBar builds it)
 *     plus the registry's primary row that bar draws inline (thumbs);
 *   - studio: the real studio loader (`STUDIO_SOURCES["chat-message"].load`,
 *     reading the message row) rendered through the real <RichDocument
 *     actionsVariant="remote"/> that PreviewPanel mounts; the set is what the
 *     studio's header bar receives from the remote-surface registry.
 *
 * The ONLY allowed difference is actions whose dialog the chat bar hosts and
 * the studio cannot (delete-vs-fork, edit history, full-page print) — absent
 * there, never dead. Before RC-B6 the studio excluded every write-back action
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

let chatMenuItems: import("@/components/official/AdvancedMenu").MenuItem[] = [];
jest.mock("@/components/official/AdvancedMenu", () => ({
  __esModule: true,
  default: (props: { items: typeof chatMenuItems }) => {
    chatMenuItems = props.items;
    return null;
  },
}));

import React, { act } from "react";
import { Provider } from "react-redux";
import { configureStore, type UnknownAction } from "@reduxjs/toolkit";
import { createRoot } from "react-dom/client";
import { enableMapSet } from "immer";
import { createSlimRootReducer, type RootState } from "@/lib/redux/rootReducer";
import type { MenuItem } from "@/components/official/AdvancedMenu";
import { STUDIO_SOURCES } from "@/components/markdown-studio/lab/content-sources";
import { RichDocument } from "../RichDocument";
import { RegistryActionMenu } from "../variants/RegistryActionMenu";
import { buildChatMessageActions } from "../chat/chatMessageActions";
import { getAction } from "../actions/registry";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
enableMapSet();

const HOST_DIALOG_ACTIONS = ["delete-message", "edit-history", "full-print"];
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
  return store;
}

function flatten(items: MenuItem[]): string[] {
  return items.flatMap((i) => (i.children ? flatten(i.children) : [i.key]));
}

it("the chat bar and the studio bar carry the same actions for one assistant message", async () => {
  const store = makeStore();
  const loaded = await STUDIO_SOURCES["chat-message"].load("msg-2");
  const noop = () => {};

  // What AssistantActionBar builds for this message (the chat host owns the
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
        <RegistryActionMenu
          isOpen
          onClose={noop}
          content={chat.content}
          source={chat.source}
          actions={chat.actions}
        />
        {/* PreviewPanel's exact mount for a loaded source. */}
        <RichDocument
          content={loaded.content}
          source={loaded.contentSource}
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

  const chatInlinePrimary = ["thumbs-up", "thumbs-down"].filter((id) =>
    Boolean(getAction(id)),
  );
  const chatSet = new Set([...flatten(chatMenuItems), ...chatInlinePrimary]);

  const stack = (store.getState() as RootState).richDocumentActionSurfaces
    .bySurfaceId[SURFACE];
  const studioSpecs = stack?.[stack.length - 1]?.computedActionSpecs ?? [];
  const studioSet = new Set(studioSpecs.map((s) => s.id));

  // Sanity: both surfaces really rendered the migrated doors.
  for (const id of [
    "add-to-rulebook",
    "summarize-and-listen",
    "save-to-notes",
    "convert-to-study",
    "edit",
  ]) {
    expect(chatSet.has(id)).toBe(true);
    expect(studioSet.has(id)).toBe(true);
  }

  const onlyInChat = [...chatSet].filter((id) => !studioSet.has(id)).sort();
  const onlyInStudio = [...studioSet].filter((id) => !chatSet.has(id)).sort();
  expect(onlyInStudio).toEqual([]);
  expect(onlyInChat).toEqual([...HOST_DIALOG_ACTIONS].sort());

  await act(async () => root.unmount());
  container.remove();
});
