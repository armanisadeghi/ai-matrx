/**
 * Guards for the Sandbox as a CANVAS CONTENT TYPE.
 *
 * The defect these pin (owner, 2026-09-13): the sandbox shipped as a bespoke
 * side panel that was permanently on screen and covered the top of the app.
 * The replacement is one more canvas content type beside `cloud_browser`,
 * documents and artifacts — opened on demand, never owning the region.
 *
 * Everything under test runs for real: the real `canvasSlice` reducer, the
 * real decision function, the real `CanvasBody` switch, the real tool filter.
 *
 * Proven failing before passing:
 *   1. registered-type   → removed `case "sandbox"` from CanvasBody;
 *      the pane rendered "Unsupported content type: sandbox" → RED.
 *   2. hidden-by-default → made `offerCanvasItem` set `isOpen = true`;
 *      the canvas was open with nothing asked for → RED.
 *   3. opens-only-when-empty → dropped the `canvasHasOtherContent` guard in
 *      `decideSandboxCanvasAction`; the sandbox hijacked a document → RED.
 *   4. closing-hides      → returned `isOpen` untouched from `closeCanvas`;
 *      the pane survived the close → RED.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import {
  canvasSlice,
  closeCanvas,
  offerCanvasItem,
  openCanvas,
  NON_PERSISTABLE_CANVAS_TYPES,
  isPersistableCanvasType,
  type CanvasContent,
} from "@/features/canvas/redux/canvasSlice";
import { CanvasBody, getDefaultTitle } from "@/features/canvas/core/CanvasBody";
import {
  buildSandboxCanvasContent,
  decideSandboxCanvasAction,
  sandboxCanvasSourceId,
} from "../useOpenSandboxCanvas";
import { isSandboxTool } from "../sandbox-activity";
import {
  readSandboxCanvasMemory,
  writeSandboxCanvasMemory,
} from "../sandboxCanvasMemory";

// The two leaves that would open a pty / fetch a file tree. Their PRESENCE is
// what is asserted here, not their internals.
jest.mock("@/features/code/terminal/SimpleTerminal", () => ({
  SimpleTerminal: ({ sandboxId }: { sandboxId: string | null }) => (
    <div data-testid="simple-terminal">{sandboxId}</div>
  ),
}));
jest.mock("@/features/agents/components/debug/SandboxFileViewer", () => ({
  SandboxFileViewer: ({ sandboxRowId }: { sandboxRowId: string }) => (
    <div data-testid="sandbox-file-viewer">{sandboxRowId}</div>
  ),
}));

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

const CONVERSATION_ID = "11111111-1111-1111-1111-111111111111";
const SANDBOX_ROW_ID = "22222222-2222-2222-2222-222222222222";

const sandboxContent = buildSandboxCanvasContent({
  sandboxRowId: SANDBOX_ROW_ID,
  conversationId: CONVERSATION_ID,
  fallbackName: "dev box",
});

const documentContent: CanvasContent = {
  type: "working_document",
  data: { conversationId: CONVERSATION_ID, kind: "working" },
  metadata: {
    title: "Working document",
    sourceMessageId: `wd:${CONVERSATION_ID}:working`,
  },
};

/** The real reducer, driven from its real initial state. */
function reduce(actions: ReturnType<typeof openCanvas>[]) {
  return actions.reduce(
    (state, action) => canvasSlice.reducer(state, action),
    canvasSlice.reducer(undefined, { type: "@@init" }),
  );
}

describe("the sandbox is a registered canvas content type", () => {
  it("renders the real Terminal/Files/Activity pane through the canvas switch", async () => {
    // A store shaped like the slices the pane actually reads — a hidden
    // dependency would surface as a missing key, not as a silent pass.
    const store = configureStore({
      reducer: {
        activeRequests: () => ({ byConversationId: {}, byRequestId: {} }),
        observability: () => ({ toolCalls: {} }),
      },
    });
    (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        instance: { id: SANDBOX_ROW_ID, status: "running", name: "dev box" },
      }),
    })) as unknown as typeof fetch;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Provider store={store}>
          <CanvasBody content={sandboxContent} />
        </Provider>,
      );
    });

    expect(container.textContent).not.toContain("Unsupported content type");
    expect(
      container.querySelector('[data-testid="sandbox-canvas-body"]'),
    ).not.toBeNull();
    for (const label of ["Terminal", "Files", "Activity"]) {
      expect(container.textContent).toContain(label);
    }

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("names the pane and refuses to persist a live box", () => {
    expect(getDefaultTitle("sandbox")).toBe("Sandbox");
    expect(NON_PERSISTABLE_CANVAS_TYPES.has("sandbox")).toBe(true);
    expect(isPersistableCanvasType("sandbox")).toBe(false);
  });

  it("carries the pointer the pane needs and one stable identity per box", () => {
    expect(sandboxContent.type).toBe("sandbox");
    expect(sandboxContent.data).toEqual({
      sandboxRowId: SANDBOX_ROW_ID,
      fallbackName: "dev box",
    });
    expect(sandboxContent.metadata?.conversationId).toBe(CONVERSATION_ID);
    expect(sandboxContent.metadata?.sourceMessageId).toBe(
      sandboxCanvasSourceId(CONVERSATION_ID, SANDBOX_ROW_ID),
    );
  });
});

describe("default hidden", () => {
  it("shows nothing before anything has happened", () => {
    const state = reduce([]);
    expect(state.isOpen).toBe(false);
    expect(state.items).toHaveLength(0);
  });

  it("offering a bound sandbox makes it available WITHOUT opening the canvas", () => {
    const state = reduce([offerCanvasItem(sandboxContent)]);
    expect(state.isOpen).toBe(false);
    expect(state.items).toHaveLength(1);
    // Reachable: the shell only mounts what is current, so an offered item
    // with nothing else current must become current or it is a dead end.
    expect(state.currentItemId).toBe(state.items[0].id);
  });

  it("offering twice never stacks two sandbox panes", () => {
    const state = reduce([
      offerCanvasItem(sandboxContent),
      offerCanvasItem(sandboxContent),
    ]);
    expect(state.items).toHaveLength(1);
  });

  it("offering never steals the pane the user is reading", () => {
    const state = reduce([
      openCanvas(documentContent),
      offerCanvasItem(sandboxContent),
    ]);
    expect(state.items).toHaveLength(2);
    expect(state.currentItemId).toBe(
      state.items.find((i) => i.content.type === "working_document")?.id,
    );
  });
});

describe("it opens on demand, and only when nothing else is on the canvas", () => {
  const base = {
    bound: true,
    toolRan: true,
    autoOpen: true,
    alreadyAutoOpened: false,
    userClosed: false,
    canvasHasOtherContent: false,
  };

  it("does nothing at all when no box is bound", () => {
    expect(decideSandboxCanvasAction({ ...base, bound: false })).toBe("none");
  });

  it("is merely available until the agent actually works in the box", () => {
    expect(decideSandboxCanvasAction({ ...base, toolRan: false })).toBe(
      "offer",
    );
  });

  it("opens on the first sandbox tool call when the canvas is empty", () => {
    expect(decideSandboxCanvasAction(base)).toBe("open");
  });

  it("offers instead of hijacking a document or the browser", () => {
    expect(
      decideSandboxCanvasAction({ ...base, canvasHasOtherContent: true }),
    ).toBe("offer");
  });

  it("respects the user's auto-open knob", () => {
    expect(decideSandboxCanvasAction({ ...base, autoOpen: false })).toBe(
      "offer",
    );
  });

  it("never re-opens behind the user after the first reveal", () => {
    expect(
      decideSandboxCanvasAction({ ...base, alreadyAutoOpened: true }),
    ).toBe("none");
  });

  it("fires on the sandbox tools and nothing else", () => {
    for (const tool of [
      "shell_execute",
      "shell_python",
      "fs_read_file",
      "fs_write_file",
      "git_ingest",
      "github_repositories",
      "code_execute_python",
      "coding:shell_execute",
    ]) {
      expect(isSandboxTool(tool)).toBe(true);
    }
    for (const tool of ["web_search", "cloud_browser_navigate", "", null]) {
      expect(isSandboxTool(tool)).toBe(false);
    }
  });
});

describe("a put-away pane STAYS put away, across reloads", () => {
  /**
   * The defect (owner, seen live 2026-09-13): "Put away canvas" did not
   * persist — a reload brought the sandbox pane straight back. The reveal
   * decision lived in a React ref and the canvas slice is deliberately not
   * persisted, so every load replayed the first-tool-call reveal.
   *
   * Proven failing before passing:
   *   - dropped the `userClosed` branch from `decideSandboxCanvasAction`;
   *     a put-away pane returned "open" on the next tool call → RED.
   *   - made `writeSandboxCanvasMemory` a no-op; the decision did not survive
   *     the simulated reload → RED.
   */
  const base = {
    bound: true,
    toolRan: true,
    autoOpen: true,
    alreadyAutoOpened: false,
    userClosed: false,
    canvasHasOtherContent: false,
  };

  beforeEach(() => {
    window.localStorage.clear();
  });

  it("never re-opens a pane the user closed, even on a later tool call", () => {
    expect(decideSandboxCanvasAction({ ...base, userClosed: true })).toBe(
      "offer",
    );
  });

  it("keeps it reachable rather than removing it", () => {
    // "offer", not "none": the box is still one click away in the switcher.
    expect(
      decideSandboxCanvasAction({
        ...base,
        userClosed: true,
        alreadyAutoOpened: true,
      }),
    ).toBe("offer");
  });

  it("remembers the decision across a reload, per conversation AND per box", () => {
    const sourceId = sandboxCanvasSourceId(CONVERSATION_ID, SANDBOX_ROW_ID);
    const otherBox = sandboxCanvasSourceId(
      CONVERSATION_ID,
      "33333333-3333-3333-3333-333333333333",
    );

    writeSandboxCanvasMemory(sourceId, { userClosed: true });

    // A reload is exactly this: nothing in memory, everything re-read.
    expect(readSandboxCanvasMemory(sourceId).userClosed).toBe(true);
    // Binding a DIFFERENT box to the same chat is a new thing to reveal.
    expect(readSandboxCanvasMemory(otherBox).userClosed).toBe(false);
    // And so is the same box in a different conversation.
    expect(
      readSandboxCanvasMemory(
        sandboxCanvasSourceId("other-conversation", SANDBOX_ROW_ID),
      ).userClosed,
    ).toBe(false);
  });

  it("remembers that the reveal already happened, so a reload is not a first run", () => {
    const sourceId = sandboxCanvasSourceId(CONVERSATION_ID, SANDBOX_ROW_ID);
    writeSandboxCanvasMemory(sourceId, { autoOpened: true });
    expect(readSandboxCanvasMemory(sourceId).autoOpened).toBe(true);
    expect(
      decideSandboxCanvasAction({ ...base, alreadyAutoOpened: true }),
    ).toBe("none");
  });

  it("re-opening clears the decision, so the pane behaves normally again", () => {
    const sourceId = sandboxCanvasSourceId(CONVERSATION_ID, SANDBOX_ROW_ID);
    writeSandboxCanvasMemory(sourceId, { userClosed: true });
    writeSandboxCanvasMemory(sourceId, { userClosed: false });
    expect(readSandboxCanvasMemory(sourceId).userClosed).toBe(false);
  });

  it("survives a storage that refuses to answer", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    try {
      // A blocked store costs the memory and nothing else — never a throw
      // that takes the chat down with it.
      expect(() =>
        writeSandboxCanvasMemory("sandbox:c:b", { userClosed: true }),
      ).not.toThrow();
      expect(readSandboxCanvasMemory("sandbox:c:b")).toEqual({
        autoOpened: false,
        userClosed: false,
      });
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
    }
  });
});

describe("closing the canvas hides it", () => {
  it("leaves nothing on screen, and keeps the pane reachable for reopen", () => {
    const state = reduce([openCanvas(sandboxContent), closeCanvas()]);
    expect(state.isOpen).toBe(false);
    expect(state.items).toHaveLength(1);
    expect(state.currentItemId).not.toBeNull();
  });
});
