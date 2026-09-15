/**
 * THE DOOR LAW: every record the UI names opens.
 *
 * These guards pin the production defect an independent reviewer reported on
 * 2026-09-15 (row 1a4fbff1-b6ed-451e-b90d-d755c17624c1): a chat agent called
 * the `document` tool, the tool SUCCEEDED (a `workbench.udt_documents` row was
 * created), and the agent replied «Created and opened as a document artifact».
 * Nothing opened in the canvas, no card appeared in the thread, and no drop
 * notice fired — because the tool result never made an open-in-canvas request
 * at all.
 *
 * Everything under test runs for real: the real registry reader, the real
 * decision function, the real `canvasSlice` reducer, the real tool-card
 * renderer, the real snapshot→markdown reader, the real switcher rule.
 *
 * Proven failing before passing — re-run these mutations to re-prove:
 *   a. made `readToolResultCanvasOffer` return null for the nested `create`
 *      shape (the parser bug that shipped) → no offer, no card action → RED.
 *   b. dropped the `canvasHasOtherContent` guard in
 *      `decideToolResultCanvasAction` → a document hijacked the sandbox → RED.
 *   c. restored `itemCount > 2` in `shouldShowCanvasSwitcher` → two items, no
 *      switcher → RED.
 *   d1. removed `case "udt_document"` from `CanvasBody` → the pane rendered
 *       "Unsupported content type: udt_document" → RED.
 *   d2. reverted `canvasTypeHasSource` to refuse every NON_PERSISTABLE type →
 *       the document's Source tab vanished → RED.
 *   d3. made `univerDocToMarkdown` return "" → the pane could show a title but
 *       never the document's content → RED.
 *
 * Measured 2026-09-15: a=2 failed, b=1, c=1, d1=1, d2=1, d3=1, all 23 green
 * with every mutation reverted.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import {
  canvasSlice,
  offerCanvasItem,
  openCanvas,
  registerCanvasDock,
  selectCanvasItems,
  selectCanvasIsOpen,
  isPersistableCanvasType,
  type CanvasContent,
} from "@/features/canvas/redux/canvasSlice";
import { CanvasBody, getDefaultTitle } from "@/features/canvas/core/CanvasBody";
import { canvasTypeHasSource } from "@/features/canvas/core/canvasSource";
import { shouldShowCanvasSwitcher } from "@/features/canvas/core/canvasSwitcher";
import {
  readToolResultCanvasOffer,
  registeredToolResultCanvasKeys,
} from "@/features/canvas/tool-results/toolResultCanvasRegistry";
import {
  canvasHoldsOtherContent,
  decideToolResultCanvasAction,
} from "@/features/canvas/tool-results/decideToolResultCanvasAction";
import { buildDocumentCanvasContent } from "@/features/data-tables/hooks/useOpenDocumentCanvas";
import { univerDocToMarkdown } from "@/features/data-tables/univer-doc-to-markdown";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { DocumentInline } from "@/features/tool-call-visualization/renderers/document/DocumentInline";
import { CanvasNavigation } from "@/features/canvas/core/CanvasNavigation";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const toastError = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
  },
}));

const DOC_ID = "9be6ac95-b1d8-4876-b96a-a0d6ede90729";

/** The EXACT shape aidream's `document` tool returns for action=create. */
const CREATE_RESULT = {
  action: "create",
  created: true,
  document: { id: DOC_ID, document_name: "Canvas Switcher Probe" },
  saved: true,
};

function makeStore() {
  return configureStore({
    reducer: { canvas: canvasSlice.reducer },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
}

function entryWith(result: unknown): ToolLifecycleEntry {
  return {
    callId: "toolu_01EkYmNFg7McQWgarboQnE2m",
    toolName: "document",
    displayName: "document",
    status: "completed",
    arguments: {},
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    latestMessage: null,
    latestData: null,
    result,
    resultPreview: null,
    errorType: null,
    errorMessage: null,
    isDelegated: false,
    events: [],
  } as unknown as ToolLifecycleEntry;
}

function mount(store: ReturnType<typeof makeStore>, node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Provider store={store}>{node}</Provider>);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function findCanvasButton(container: HTMLElement): HTMLButtonElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent?.includes("Open in canvas"),
    ) ?? null
  );
}

beforeEach(() => toastError.mockClear());

// ── (a) a document tool result dispatches an offer and renders the card ─────

describe("a document tool result reaches the canvas", () => {
  it("reads the create shape the backend really returns", () => {
    const offer = readToolResultCanvasOffer("document", CREATE_RESULT, {
      conversationId: "bb458c1e-0000-4000-8000-000000000001",
    });
    expect(offer).not.toBeNull();
    expect(offer!.label).toBe("Canvas Switcher Probe");
    expect(offer!.content.type).toBe("udt_document");
    expect(offer!.content.data).toEqual({ documentId: DOC_ID });
    // Stable identity — offering twice must never stack two panes.
    expect(offer!.sourceId).toBe(
      readToolResultCanvasOffer("document", CREATE_RESULT, {})!.sourceId,
    );
  });

  it("is registered as a CLASS — by tool name AND by result kind", () => {
    const keys = registeredToolResultCanvasKeys();
    expect(keys).toContain("document");
    expect(keys).toContain("udt_document");
    // A future tool that emits a udt_document record inherits the door with no
    // second registration: the KIND routes it.
    const byKind = readToolResultCanvasOffer(
      "some_future_tool",
      { __kind: "udt_document", document_id: DOC_ID, name: "Inherited" },
      {},
    );
    expect(byKind?.content.type).toBe("udt_document");
    expect(byKind?.label).toBe("Inherited");
  });

  it("offers nothing for a plain read or a no-op edit", () => {
    expect(
      readToolResultCanvasOffer(
        "document",
        { action: "read", document_id: DOC_ID, name: "X", text: "hi" },
        {},
      ),
    ).toBeNull();
    expect(
      readToolResultCanvasOffer(
        "document",
        { action: "edit", document_id: DOC_ID, applied: [] },
        {},
      ),
    ).toBeNull();
  });

  it("an offer lands in the switcher WITHOUT taking the screen", () => {
    const store = makeStore();
    const offer = readToolResultCanvasOffer("document", CREATE_RESULT, {})!;
    act(() => {
      store.dispatch(offerCanvasItem(offer.content));
    });
    const state = store.getState();
    expect(selectCanvasItems(state)).toHaveLength(1);
    expect(selectCanvasItems(state)[0].content.type).toBe("udt_document");
    // Offered, not opened: nothing at all changed on screen.
    expect(selectCanvasIsOpen(state)).toBe(false);

    // Offering the same record again is ONE pane, never two.
    act(() => {
      store.dispatch(offerCanvasItem(offer.content));
    });
    expect(selectCanvasItems(store.getState())).toHaveLength(1);
  });

  it("renders a card in the thread whose canvas action opens THAT document", () => {
    const store = makeStore();
    store.dispatch(registerCanvasDock()); // a DOCKED chat route — the default
    const { container, unmount } = mount(
      store,
      <DocumentInline entry={entryWith(CREATE_RESULT)} />,
    );

    expect(container.textContent).toContain("Canvas Switcher Probe");
    const button = findCanvasButton(container);
    expect(button).not.toBeNull();

    act(() => button!.click());

    const items = selectCanvasItems(store.getState());
    expect(selectCanvasIsOpen(store.getState())).toBe(true);
    expect(items).toHaveLength(1);
    expect(items[0].content.type).toBe("udt_document");
    expect(items[0].content.data).toEqual({ documentId: DOC_ID });
    expect(items[0].content.metadata?.title).toBe("Canvas Switcher Probe");
    expect(toastError).not.toHaveBeenCalled();

    unmount();
  });

  it("announces a drop instead of doing nothing when no canvas is reachable", () => {
    const store = makeStore(); // no dock, no sheet — no canvas surface at all
    const { container, unmount } = mount(
      store,
      <DocumentInline entry={entryWith(CREATE_RESULT)} />,
    );
    act(() => findCanvasButton(container)!.click());

    expect(selectCanvasItems(store.getState())).toHaveLength(0);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(String(toastError.mock.calls[0][0])).toContain(
      "Canvas Switcher Probe",
    );
    unmount();
  });

  it("a completed call carrying nothing still leaves a trace", () => {
    const store = makeStore();
    const { container, unmount } = mount(
      store,
      <DocumentInline entry={entryWith({ action: "create", created: true })} />,
    );
    expect(container.textContent?.trim()).not.toBe("");
    expect(container.textContent).toContain("Created a document");
    expect(container.textContent).toContain("nothing to open from here");
    expect(
      container.querySelector<HTMLAnchorElement>('a[href="/documents"]'),
    ).not.toBeNull();
    unmount();
  });

  it("stays silent only while the call is still in flight", () => {
    const store = makeStore();
    const streaming = {
      ...entryWith(null),
      status: "started",
    } as unknown as ToolLifecycleEntry;
    const { container, unmount } = mount(
      store,
      <DocumentInline entry={streaming} />,
    );
    expect(container.textContent?.trim()).toBe("");
    unmount();
  });
});

// ── (b) auto-open only on an empty canvas ──────────────────────────────────

describe("the canvas is never hijacked", () => {
  const base = {
    autoOpen: true,
    alreadyAutoOpened: false,
    userClosed: false,
    canvasHasOtherContent: false,
    isNewest: true,
  };

  it("opens into an EMPTY canvas", () => {
    expect(decideToolResultCanvasAction(base)).toBe("open");
  });

  it("only OFFERS when the canvas is showing something else", () => {
    expect(
      decideToolResultCanvasAction({ ...base, canvasHasOtherContent: true }),
    ).toBe("offer");
  });

  it("only OFFERS when the user turned auto-open off", () => {
    expect(decideToolResultCanvasAction({ ...base, autoOpen: false })).toBe(
      "offer",
    );
  });

  it("a pane the user put away stays away — but stays reachable", () => {
    expect(decideToolResultCanvasAction({ ...base, userClosed: true })).toBe(
      "offer",
    );
  });

  it("never reveals the same record twice — but keeps it reachable", () => {
    // Measured live 2026-09-15: "none" here stranded a document outside every
    // switcher after a reload, because the canvas slice is not persisted and
    // the reveal memory is.
    expect(
      decideToolResultCanvasAction({ ...base, alreadyAutoOpened: true }),
    ).toBe("offer");
  });

  it("only the newest record may take an empty canvas", () => {
    expect(decideToolResultCanvasAction({ ...base, isNewest: false })).toBe(
      "offer",
    );
  });

  it("a SECOND document never takes the pane from the first", () => {
    // Measured live on production, 2026-09-15: the first document opened, the
    // agent made a second, and the canvas jumped to it. The rule had been
    // computed ONCE against every offer of the conversation, so a canvas
    // already showing the first document read as empty. "Other content" is
    // per-record: anything on the canvas that is not THIS record's own pane.
    const first = "udt-document:11111111-1111-4111-8111-111111111111";
    const second = "udt-document:22222222-2222-4222-8222-222222222222";
    expect(canvasHoldsOtherContent([first], second)).toBe(true);
    expect(
      decideToolResultCanvasAction({
        ...base,
        canvasHasOtherContent: canvasHoldsOtherContent([first], second),
      }),
    ).toBe("offer");
    // …while the record's OWN pane sitting there is not "something else".
    expect(canvasHoldsOtherContent([second], second)).toBe(false);
    expect(
      decideToolResultCanvasAction({
        ...base,
        canvasHasOtherContent: canvasHoldsOtherContent([second], second),
      }),
    ).toBe("open");
    // An empty canvas holds nothing.
    expect(canvasHoldsOtherContent([], second)).toBe(false);
  });

  it("the reducer itself refuses to steal a pane the user is reading", () => {
    const store = makeStore();
    const sandbox: CanvasContent = {
      type: "sandbox",
      data: { sandboxRowId: "box-1" },
      metadata: { title: "Sandbox", sourceMessageId: "sandbox:box-1" },
    };
    act(() => {
      store.dispatch(openCanvas(sandbox));
      store.dispatch(
        offerCanvasItem(
          buildDocumentCanvasContent({ documentId: DOC_ID, title: "Doc" }),
        ),
      );
    });
    const state = store.getState();
    const current = selectCanvasItems(state).find(
      (i) => i.id === state.canvas.currentItemId,
    );
    expect(current?.content.type).toBe("sandbox");
    expect(selectCanvasItems(state)).toHaveLength(2);
  });
});

// ── (c) switcher visible with 2 items ──────────────────────────────────────

describe("the switcher", () => {
  it("appears with two items and not with one", () => {
    expect(
      shouldShowCanvasSwitcher({
        paneRole: "single",
        itemCount: 1,
        isSplit: false,
      }),
    ).toBe(false);
    expect(
      shouldShowCanvasSwitcher({
        paneRole: "single",
        itemCount: 2,
        isSplit: false,
      }),
    ).toBe(true);
    expect(
      shouldShowCanvasSwitcher({
        paneRole: "bottom",
        itemCount: 2,
        isSplit: false,
      }),
    ).toBe(false);
    expect(
      shouldShowCanvasSwitcher({
        paneRole: "single",
        itemCount: 2,
        isSplit: true,
      }),
    ).toBe(false);
  });

  it("renders a real, clickable control that switches items", () => {
    const store = makeStore();
    act(() => {
      store.dispatch(
        openCanvas({
          type: "sandbox",
          data: { sandboxRowId: "box-1" },
          metadata: { title: "Sandbox", sourceMessageId: "sandbox:box-1" },
        }),
      );
      store.dispatch(
        offerCanvasItem(
          buildDocumentCanvasContent({
            documentId: DOC_ID,
            title: "Canvas Switcher Probe",
          }),
        ),
      );
    });
    const items = selectCanvasItems(store.getState());
    expect(items).toHaveLength(2);

    const navigated: string[] = [];
    const { container, unmount } = mount(
      store,
      <CanvasNavigation
        items={items}
        currentItemId={items[0].id}
        onNavigate={(id) => navigated.push(id)}
        onRemove={() => {}}
      />,
    );

    const switcher = container.querySelector("[data-canvas-switcher]");
    expect(switcher).not.toBeNull();
    // It says WHERE you are out of HOW MANY — the control the reviewer could
    // not find at 1280x720.
    expect(switcher!.textContent).toContain("1/2");

    const buttons = Array.from(
      switcher!.querySelectorAll<HTMLButtonElement>("button"),
    );
    const next = buttons[buttons.length - 1];
    expect(next.disabled).toBe(false);
    act(() => next.click());
    expect(navigated).toEqual([items[1].id]);

    unmount();
  });
});

// ── (d) the udt_document pane renders title + content from a fixture row ────

describe("the udt_document canvas type", () => {
  it("is a registered type with its own title, and never persists a copy", () => {
    expect(getDefaultTitle("udt_document")).toBe("Document");
    // The editor owns its own append-only snapshot history; a canvas_items row
    // would freeze a stale copy beside the live one.
    expect(isPersistableCanvasType("udt_document")).toBe(false);
  });

  it("still OFFERS a Source tab — unlike the live panes", () => {
    // A document is a pointer to a DURABLE authored record, so its markdown is
    // exactly what a person means by "Source".
    expect(canvasTypeHasSource("udt_document")).toBe(true);
    // The genuinely live surfaces have no source of their own.
    expect(canvasTypeHasSource("sandbox")).toBe(false);
    expect(canvasTypeHasSource("cloud_browser")).toBe(false);
  });

  it("has a real case in the CanvasBody switch — never 'Unsupported'", () => {
    const store = makeStore();
    const { container, unmount } = mount(
      store,
      <CanvasBody
        content={buildDocumentCanvasContent({
          documentId: DOC_ID,
          title: "Canvas Switcher Probe",
        })}
      />,
    );
    // The dead end this replaces: a pane that names a type nobody can render.
    expect(container.textContent).not.toContain("Unsupported content type");
    expect(container.textContent).not.toContain("udt_document");
    unmount();
  });

  it("names the document and points at its row", () => {
    const content = buildDocumentCanvasContent({
      documentId: DOC_ID,
      title: "Canvas Switcher Probe",
      conversationId: "bb458c1e-0000-4000-8000-000000000001",
    });
    expect(content.type).toBe("udt_document");
    expect(content.data).toEqual({ documentId: DOC_ID });
    expect(content.metadata?.title).toBe("Canvas Switcher Probe");
    expect(content.metadata?.conversationId).toBe(
      "bb458c1e-0000-4000-8000-000000000001",
    );
  });

  it("reads the document's markdown back out of a real snapshot row", () => {
    // The exact shape `workbench.udt_document_snapshots.snapshot` holds: a
    // Univer IDocumentData body. `\r` terminates each paragraph; the heading
    // is a bold run at the heading font size.
    const dataStream = "Canvas Switcher Probe\rThe door is open.\r\n";
    const headingEnd = "Canvas Switcher Probe".length;
    const snapshot = {
      id: "doc-1",
      title: "Canvas Switcher Probe",
      body: {
        dataStream,
        paragraphs: [
          { startIndex: headingEnd },
          { startIndex: dataStream.length - 2 },
        ],
        textRuns: [
          { st: 0, ed: headingEnd, ts: { bl: 1, fs: 26 } },
          {
            st: headingEnd + 1,
            ed: dataStream.length - 2,
            ts: {},
          },
        ],
        sectionBreaks: [{ startIndex: dataStream.length - 1 }],
      },
    };

    const markdown = univerDocToMarkdown(snapshot);
    expect(markdown).toContain("# Canvas Switcher Probe");
    expect(markdown).toContain("The door is open.");
    // Never the envelope — no pointers, no message ids, no redux keys.
    expect(markdown).not.toContain("documentId");
    expect(markdown).not.toContain("dataStream");
  });

  it("says so honestly when the snapshot holds nothing", () => {
    expect(univerDocToMarkdown(null)).toBe("");
    expect(univerDocToMarkdown({ body: { dataStream: "" } })).toBe("");
  });
});
