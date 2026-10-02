/**
 * THE QUICK TOOLS ARE CANVAS TABS (Arman, 2026-10-02: "Should the quick tools
 * become canvas tabs — Yes").
 *
 * Quick Chat, Quick Notes, Quick Tasks, the Scratchpad, Quick Data, Quick
 * Scribe, a conversation's Documents, "what the agent receives" and a note's
 * knowledge base used to open in a second floating side panel that sat on top
 * of the canvas. Each is now ONE canvas kind (features/canvas/host/toolKinds.tsx)
 * and every door to it opens that kind's tab.
 *
 * Everything here runs for real: the app's root reducer (canvas state under
 * `canvasHost`), the app's ONE canvas binding `CanvasHostProvider` (which
 * registers the tool kinds), the real Quick Access menu rows, the real opener
 * hooks every caller uses. A door that stops opening its tab — a menu row that
 * goes back to an overlay, an opener that keys the tab by the moment instead
 * of the thing, a reopen that resets Quick Chat's conversation — goes RED.
 *
 * Proven failing before passing (2026-10-02): `toggleToolInCanvas` made to
 * return null without toggling → every test RED; restored → GREEN. A Quick
 * Access row is a toolbar icon (`toggleKind`): absent opens, behind comes
 * forward, in front closes (Quick Chat / Scribe put the canvas away instead).
 */

import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureStore } from "@reduxjs/toolkit";
import type { CanvasItem, CanvasState } from "@ai-matrx/canvas";
import { useCanvas } from "@ai-matrx/canvas/react";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { CanvasHostProvider } from "@/features/canvas/host/CanvasHostProvider";
import { TOOL_CANVAS_KINDS } from "@/features/canvas/host/toolKinds";
import { QUICK_ACCESS_ITEMS } from "@/features/shell/components/header/header-right-menu/userMenuItems.constants";
import { CanvasToolMenuItem } from "@/features/shell/components/header/header-right-menu/CanvasToolMenuItem";
import { useOpenQuickChat, patchQuickChatData } from "@/features/quick-actions/canvas/quickChatKind";
import { useOpenQuickTasks } from "@/features/tasks/canvas/quickTasksKind";
import { useOpenConversationDocuments } from "@/features/canvas/host/conversation/documentsKind";
import { useOpenContextPreview } from "@/features/canvas/host/conversation/contextPreviewKind";
import { useOpenNoteKnowledgePanel } from "@/features/notes/canvas/noteKnowledgeKind";

function makeStore() {
  return configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
}
type Store = ReturnType<typeof makeStore>;

const canvasOf = (store: Store): CanvasState => store.getState().canvasHost;
const item = (store: Store, id: string): CanvasItem | undefined => canvasOf(store).items[id as CanvasItem["id"]];

/** Stands in for the shell's canvas column being on screen. */
function PresentedColumn() {
  const canvas = useCanvas();
  useEffect(() => canvas.registerPresentation(), [canvas]);
  return null;
}

function mount(store: Store, node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <Provider store={store}>
          <CanvasHostProvider>
            <PresentedColumn />
            {node}
          </CanvasHostProvider>
        </Provider>
      </QueryClientProvider>,
    );
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

interface Openers {
  quickChat: ReturnType<typeof useOpenQuickChat>;
  quickTasks: ReturnType<typeof useOpenQuickTasks>;
  documents: ReturnType<typeof useOpenConversationDocuments>;
  contextPreview: ReturnType<typeof useOpenContextPreview>;
  noteKnowledge: ReturnType<typeof useOpenNoteKnowledgePanel>;
}

function mountOpeners(store: Store) {
  const api: { openers: Openers | null; canvas: ReturnType<typeof useCanvas> | null } = { openers: null, canvas: null };
  function Probe() {
    api.openers = {
      quickChat: useOpenQuickChat(),
      quickTasks: useOpenQuickTasks(),
      documents: useOpenConversationDocuments(),
      contextPreview: useOpenContextPreview(),
      noteKnowledge: useOpenNoteKnowledgePanel(),
    };
    api.canvas = useCanvas();
    return null;
  }
  const mounted = mount(store, <Probe />);
  return { openers: api.openers!, canvas: api.canvas!, unmount: mounted.unmount };
}

describe("every Quick Access row opens its tool as a canvas tab", () => {
  const rows = QUICK_ACCESS_ITEMS.filter((row) => "canvasTool" in row);

  it("the six quick tools are canvas rows, not overlays", () => {
    expect(rows.map((row) => ("canvasTool" in row ? row.canvasTool : null)).sort()).toEqual(
      ["global-scratchpad", "quick-chat", "quick-data", "quick-notes", "quick-scribe", "quick-tasks"],
    );
  });

  it.each(rows.map((row) => [row.label, row] as const))("%s → its tab, toggled like a toolbar icon", (_label, row) => {
    if (!("canvasTool" in row)) throw new Error("not a canvas row");
    const store = makeStore();
    const { container, unmount } = mount(store, <CanvasToolMenuItem {...row} />);
    const button = container.querySelector("button")!;
    const id = `${row.canvasTool}::default`;
    const hides = row.canvasTool === "quick-chat" || row.canvasTool === "quick-scribe";

    // absent -> opens, in front, row shows pressed
    expect(button.getAttribute("aria-pressed")).toBe("false");
    act(() => button.click());
    expect(item(store, id)?.kind).toBe(row.canvasTool);
    expect(Object.keys(canvasOf(store).items)).toEqual([id]);
    expect(canvasOf(store).isOpen).toBe(true);
    expect(button.getAttribute("aria-pressed")).toBe("true");

    // in front -> close (or put the canvas away for live tools; the tab survives)
    act(() => button.click());
    expect(button.getAttribute("aria-pressed")).toBe("false");
    if (hides) {
      expect(item(store, id)).toBeDefined();
      expect(canvasOf(store).isOpen).toBe(false);
    } else {
      expect(item(store, id)).toBeUndefined();
    }

    // and a third press brings it back
    act(() => button.click());
    expect(item(store, id)?.kind).toBe(row.canvasTool);
    expect(canvasOf(store).isOpen).toBe(true);
    unmount();
  });

  it("something else in front -> the press brings the tool forward, not closed", () => {
    const store = makeStore();
    const notes = rows.find((row) => "canvasTool" in row && row.canvasTool === "quick-notes")!;
    const tasks = rows.find((row) => "canvasTool" in row && row.canvasTool === "quick-tasks")!;
    if (!("canvasTool" in notes) || !("canvasTool" in tasks)) throw new Error("not canvas rows");
    const { container, unmount } = mount(
      store,
      <>
        <CanvasToolMenuItem {...notes} />
        <CanvasToolMenuItem {...tasks} />
      </>,
    );
    const [notesButton, tasksButton] = Array.from(container.querySelectorAll("button"));
    act(() => notesButton.click());
    act(() => tasksButton.click()); // tasks opens in front of notes
    expect(notesButton.getAttribute("aria-pressed")).toBe("false");
    act(() => notesButton.click()); // notes is behind -> forward, NOT closed
    expect(item(store, "quick-notes::default")).toBeDefined();
    expect(notesButton.getAttribute("aria-pressed")).toBe("true");
    expect(tasksButton.getAttribute("aria-pressed")).toBe("false");
    unmount();
  });
});

describe("every tool kind is registered by the app's one canvas binding", () => {
  it("registers each kind with a lazily loaded body", () => {
    const ids = TOOL_CANVAS_KINDS.map((kind) => kind.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const kind of TOOL_CANVAS_KINDS) expect(typeof kind.load).toBe("function");
  });
});

describe("the openers callers use key each tab by the thing it shows", () => {
  it("Quick Chat: reopening keeps the conversation; a handoff opens its own tab", () => {
    const store = makeStore();
    const { openers, canvas, unmount } = mountOpeners(store);
    act(() => void openers.quickChat());
    const id = "quick-chat::default";
    act(() => patchQuickChatData(canvas, id as CanvasItem["id"], { conversationId: "conv-1", agentId: "agent-1" }));
    act(() => void openers.quickChat());
    expect(item(store, id)?.data).toMatchObject({ conversationId: "conv-1", agentId: "agent-1" });
    act(() => void openers.quickChat({ initialConversationId: "conv-2", title: "Assistant" }));
    expect(item(store, "quick-chat::conv-2")?.title).toBe("Assistant");
    expect(item(store, "quick-chat::conv-2")?.data).toMatchObject({ conversationId: "conv-2" });
    unmount();
  });

  it("Documents, Agent context and Knowledge open one tab per conversation / note", () => {
    const store = makeStore();
    const { openers, unmount } = mountOpeners(store);
    act(() => void openers.documents({ conversationId: "conv-9", initialKind: "scratch" }));
    act(() => void openers.contextPreview({ conversationId: "conv-9", agentId: "agent-9" }));
    act(() => void openers.contextPreview());
    act(() => void openers.noteKnowledge({ noteId: "note-3", title: "Trip plan" }));
    act(() => void openers.noteKnowledge({ noteId: "note-3", title: "Trip plan" }));
    expect(item(store, "conversation-documents::conv-9")?.data).toEqual({ conversationId: "conv-9", initialKind: "scratch" });
    expect(item(store, "context-preview::conv-9")?.data).toEqual({ conversationId: "conv-9", agentId: "agent-9" });
    expect(item(store, "context-preview::new")).toBeDefined();
    expect(item(store, "note-knowledge::note-3")?.title).toBe("Trip plan · Knowledge");
    expect(Object.keys(canvasOf(store).items)).toHaveLength(4);
    unmount();
  });

  it("Quick Tasks carries a prefill into its tab", () => {
    const store = makeStore();
    const { openers, unmount } = mountOpeners(store);
    act(() => void openers.quickTasks({ prePopulate: { title: "Call the vendor" } }));
    expect(item(store, "quick-tasks::default")?.data).toMatchObject({ prePopulate: { title: "Call the vendor" } });
    unmount();
  });
});
