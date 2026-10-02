/**
 * ONE CONVERSATION'S DOCUMENTS HAVE ONE TAB; THE SCRATCHPAD HAS ONE TAB.
 *
 * Until 2026-10-02 a conversation's documents opened as TWO canvas kinds: the
 * artifact content type `working_document` (keyed `wd:<id>:working`, opened by
 * the chat header's Canvas button, the composer rail's Doc pill and a tool's
 * result bar) and the tool kind `conversation-documents` (keyed by the
 * conversation id, opened by `/chat/new?attachDoc=` and the documents menu).
 * Both rendered the DocumentsWorkspace, so one click from each door gave the
 * person two tabs of the same documents. The scratchpad had the same split:
 * the content type `scratchpad` (the rail's Scratch pill) beside the tool kind
 * `global-scratchpad` (Quick Access), both an editor on the active scratchpad.
 *
 * Everything here runs for real: the app's root reducer, the app's ONE canvas
 * binding (CanvasHostProvider), the app's chat canvas port, the app's openers
 * registered on a real ChatProvider, and the chat package's own Canvas button.
 *
 * Proven failing before passing (2026-10-02): run against the previous
 * ChatCanvasButton / kinds → "the header's Canvas button opens the Documents
 * tab" RED (it opened a `working_document` artifact tab beside it) and the
 * registry test RED (`working_document` / `scratchpad` were registered).
 */

import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureStore } from "@reduxjs/toolkit";
import type { CanvasState } from "@ai-matrx/canvas";
import { useCanvas } from "@ai-matrx/canvas/react";
import { ChatProvider } from "@ai-matrx/chat/host/react";
import type { ChatHost } from "@ai-matrx/chat/host";
import { _resetChatHostForTests } from "@ai-matrx/chat/host/configure";
import { createFakeDb } from "@ai-matrx/chat/host/__tests__/fake-db";
import {
  CONVERSATION_DOCUMENTS_KIND,
  SCRATCHPAD_KIND,
  conversationDocumentsTabId,
  scratchpadTabId,
} from "@ai-matrx/chat/host/canvas-tabs";
import { useChatCanvasView } from "@ai-matrx/chat/host/canvas";
import { ChatCanvasButton } from "@ai-matrx/chat/agents/components/chat/ChatCanvasButton";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { CanvasHostProvider } from "@/features/canvas/host/CanvasHostProvider";
import { TOOL_CANVAS_KINDS } from "@/features/canvas/host/toolKinds";
import { ARTIFACT_CANVAS_KINDS } from "@/features/canvas/host/artifactKinds";
import { appChatCanvasPort } from "@/features/canvas/host/chatCanvasPort";
import { useOpenConversationDocuments } from "@/features/canvas/host/conversation/documentsKind";
import { useOpenScratchpad, useOpenScratchpadPanel } from "@/features/quick-actions/canvas/scratchpadKind";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });

const CONVERSATION_ID = "6f1e2d3c-4b5a-4968-8776-655443322110";

function makeStore() {
  return configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
}
type Store = ReturnType<typeof makeStore>;
const canvasOf = (store: Store): CanvasState => store.getState().canvasHost;
const itemIds = (store: Store) => Object.keys(canvasOf(store).items);

function PresentedColumn() {
  const canvas = useCanvas();
  useEffect(() => canvas.registerPresentation(), [canvas]);
  return null;
}

interface Probe {
  openDocuments: ReturnType<typeof useOpenConversationDocuments>;
  openScratchpadFromChat: ReturnType<typeof useOpenScratchpadPanel>;
  openScratchpadFromQuickAccess: ReturnType<typeof useOpenScratchpad>;
  sourceIds: readonly string[];
}

/** The app's chat host, with the app's own canvas port and canvas openers. */
function ChatHostUnderTest({ store, probe, children }: { store: Store; probe: Partial<Probe>; children: React.ReactNode }) {
  const openDocuments = useOpenConversationDocuments();
  const openScratchpadFromChat = useOpenScratchpadPanel();
  probe.openDocuments = openDocuments;
  probe.openScratchpadFromChat = openScratchpadFromChat;
  probe.openScratchpadFromQuickAccess = useOpenScratchpad();
  const host: ChatHost = {
    db: createFakeDb().db,
    canvas: appChatCanvasPort,
    windows: {
      open: () => undefined,
      close: () => undefined,
      openers: { openWorkingDocumentPanel: openDocuments, openScratchpadPanel: openScratchpadFromChat },
    },
  };
  return (
    <ChatProvider host={host} store={store}>
      {children}
    </ChatProvider>
  );
}

function SourceProbe({ probe }: { probe: Partial<Probe> }) {
  probe.sourceIds = useChatCanvasView().sourceIds;
  return null;
}

function mount(store: Store) {
  const probe: Partial<Probe> = {};
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <Provider store={store}>
          <CanvasHostProvider>
            <PresentedColumn />
            <ChatHostUnderTest store={store} probe={probe}>
              <ChatCanvasButton conversationId={CONVERSATION_ID} />
              <SourceProbe probe={probe} />
            </ChatHostUnderTest>
          </CanvasHostProvider>
        </Provider>
      </QueryClientProvider>,
    );
  });
  return {
    container,
    probe: probe as Probe,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

afterEach(() => _resetChatHostForTests());

describe("a conversation's documents are one canvas kind", () => {
  it("the documents and the scratchpad are tool kinds, never artifact content types", () => {
    const toolIds = TOOL_CANVAS_KINDS.map((kind) => kind.id);
    const artifactIds = ARTIFACT_CANVAS_KINDS.map((kind) => kind.id);
    expect(toolIds).toEqual(expect.arrayContaining([CONVERSATION_DOCUMENTS_KIND, SCRATCHPAD_KIND]));
    expect(artifactIds).not.toContain("working_document");
    expect(artifactIds).not.toContain("scratchpad");
  });
});

describe("every door opens the same Documents tab", () => {
  it("the header's Canvas button opens the conversation's Documents tab, and the chat sees it", () => {
    const store = makeStore();
    const { container, probe, unmount } = mount(store);
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Canvas"]');
    act(() => button?.click());

    expect(itemIds(store)).toEqual([conversationDocumentsTabId(CONVERSATION_ID)]);
    expect(canvasOf(store).items[conversationDocumentsTabId(CONVERSATION_ID)]?.kind).toBe(CONVERSATION_DOCUMENTS_KIND);
    // The chat recognises the tab it opened (the rail's Doc pill lights up).
    expect(probe.sourceIds).toContain(conversationDocumentsTabId(CONVERSATION_ID));

    // A second door (a result bar, `?attachDoc=`, the documents menu) focuses it.
    act(() => void probe.openDocuments({ conversationId: CONVERSATION_ID, initialKind: "scratch" }));
    expect(itemIds(store)).toEqual([conversationDocumentsTabId(CONVERSATION_ID)]);
    unmount();
  });

  it("the chat's Scratch pill and Quick Access open the same scratchpad tab", () => {
    const store = makeStore();
    const { probe, unmount } = mount(store);
    act(() => void probe.openScratchpadFromChat({ gateConversationId: CONVERSATION_ID }));
    act(() => void probe.openScratchpadFromQuickAccess());

    expect(itemIds(store)).toEqual([scratchpadTabId()]);
    const tab = canvasOf(store).items[scratchpadTabId()];
    expect(tab?.kind).toBe(SCRATCHPAD_KIND);
    // The chat that opened it is kept, so the tab offers "Share with this chat".
    expect(tab?.data).toEqual({ gateConversationId: CONVERSATION_ID });
    expect(probe.sourceIds).toContain(scratchpadTabId());
    unmount();
  });
});
