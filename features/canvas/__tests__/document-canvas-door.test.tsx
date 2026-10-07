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
 * Everything under test runs for real, on the canvas as it is now built
 * (`@ai-matrx/canvas`): a Redux store holding `canvasHost: canvasReducer`,
 * bound by the app's ONE binding `CanvasHostProvider` (which registers every
 * artifact kind), the real openers (`useCanvasOpeners`, `useOpenDocumentCanvas`),
 * the real tool-card renderer, the real tab strip (`CanvasPaneView`) with the
 * artifact kind's own header action and lazily loaded body (`CanvasBody`), the
 * real registry reader, decision function and snapshot→markdown reader.
 *
 * Retired with the old canvas slice (2026-10-01): the "switcher appears with
 * two items" rule (`shouldShowCanvasSwitcher`) and `CanvasNavigation`. The
 * package's pane always draws a tab per item, so "is the second item
 * reachable?" is now pinned by clicking its real tab.
 *
 * Proven failing before passing — re-run these mutations to re-prove:
 *   a. made `readToolResultCanvasOffer` return null for the nested `create`
 *      shape (the parser bug that shipped) → no offer, no card action → RED.
 *   b. dropped the `canvasHasOtherContent` guard in
 *      `decideToolResultCanvasAction` → a document hijacked the sandbox → RED.
 *   c. made `useCanvasOpeners().offer` open WITHOUT `quiet` → the offer took
 *      the screen and stole the sandbox's tab → 3 RED.
 *   d1. removed `case "udt_document"` from `CanvasBody` → the pane rendered
 *       "Unsupported content type: udt_document" → 2 RED (direct + the tab's
 *       lazily loaded body).
 *   d2. reverted `canvasTypeHasSource` to refuse every NON_PERSISTABLE type →
 *       the document tab's "Show source" action vanished → RED.
 *   d3. made `univerDocToMarkdown` return "" → the pane could show a title but
 *       never the document's content → RED.
 * c, d1, d2 re-measured on this rebuild (2026-10-02); a, b, d3 guard pure
 * functions whose tests did not change.
 */

import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureStore } from "@reduxjs/toolkit";

import {
  selectCanvasActiveItem,
  selectCanvasIsOpen,
  type CanvasItem,
  type CanvasState,
} from "@ai-matrx/canvas";
import {
  CanvasPaneView,
  getCanvasKind,
  useCanvas,
} from "@ai-matrx/canvas/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { CanvasHostProvider } from "@/features/canvas/host/CanvasHostProvider";
import { useCanvasOpeners, type CanvasOpeners } from "@/features/canvas/host/canvasSources";
import { contentOf, readArtifactItemData } from "@/features/canvas/host/artifactItem";
import { CanvasBody } from "@/features/canvas/core/CanvasBody";
import {
  getDefaultTitle,
  isPersistableCanvasType,
  type CanvasContent,
} from "@/features/canvas/canvasContent";
import { canvasTypeHasSource } from "@/features/canvas/core/canvasSource";
import {
  readToolResultCanvasOffer,
  registeredToolResultCanvasKeys,
} from "@/features/canvas/tool-results/toolResultCanvasRegistry";
import {
  canvasHoldsOtherContent,
  decideToolResultCanvasAction,
} from "@/features/canvas/tool-results/decideToolResultCanvasAction";
import { buildDocumentCanvasContent } from "@/features/documents/hooks/useOpenDocumentCanvas";
import { univerDocToMarkdown } from "@/features/documents/univer-doc-to-markdown";
import type { ToolLifecycleEntry } from "@ai-matrx/chat/agents/types/request.types";
import { DocumentInline } from "@/features/chat-tool-renderers/renderers/document/DocumentInline";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

// jsdom has no ResizeObserver; the artifact view's scroll fade observes its
// box. A no-op observer is the jsdom stand-in, not a behaviour under test.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= NoopResizeObserver;
// …nor scrollIntoView, which the tab strip calls to keep the active tab seen.
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}

// The two LEAF editors are network-bound (a live pty, the Univer editor
// fetching its snapshot). They are the boundary: everything above them —
// the kind, the lazily loaded artifact view, CanvasBody's switch — is real,
// and the stubs print the pointer CanvasBody handed them.
jest.mock("@/features/documents/components/DocumentCanvasBody", () => ({
  DocumentCanvasBody: ({ documentId }: { documentId: string }) => (
    <div data-testid="document-canvas-body">{documentId}</div>
  ),
}));
jest.mock(
  "@ai-matrx/chat/agents/components/chat/sandbox-insight/SandboxCanvasBody",
  () => ({
    SandboxCanvasBody: ({ sandboxRowId }: { sandboxRowId: string }) => (
      <div data-testid="sandbox-canvas-body">{sandboxRowId}</div>
    ),
  }),
);

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

const SANDBOX: CanvasContent = {
  type: "sandbox",
  data: { sandboxRowId: "box-1" },
  metadata: { title: "Sandbox", sourceMessageId: "sandbox:box-1" },
};

/** The app's real store shape — `canvasHost` included — from the app's own
 *  root reducer, so every body a tab draws reads the slices it reads live. */
function makeStore() {
  return configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
}

type Store = ReturnType<typeof makeStore>;

const canvasOf = (store: Store): CanvasState => store.getState().canvasHost;
const itemsOf = (store: Store): CanvasItem[] => Object.values(canvasOf(store).items);
const contentOfItem = (item: CanvasItem | null | undefined): CanvasContent | null => {
  const data = item ? readArtifactItemData(item.data) : null;
  return data ? contentOf(data) : null;
};

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

/**
 * Stands in for the shell's canvas column being on screen: the column is the
 * one thing that registers a presentation, and an open with none is refused.
 */
function PresentedColumn() {
  const canvas = useCanvas();
  useEffect(() => canvas.registerPresentation(), [canvas]);
  return null;
}

/**
 * `canvas`: "presented" = provider + a column on screen (every shell route);
 * "provider-only" = provider, no column (kiosk, meeting stage); "none" = no
 * canvas provider at all.
 */
type CanvasMode = "presented" | "provider-only" | "none";

function mount(store: Store, node: React.ReactNode, canvas: CanvasMode = "presented") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <Provider store={store}>
          {canvas === "none" ? (
            node
          ) : (
            <CanvasHostProvider>
              {canvas === "presented" ? <PresentedColumn /> : null}
              {node}
            </CanvasHostProvider>
          )}
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

function findCanvasButton(container: HTMLElement): HTMLButtonElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent?.includes("Open in canvas"),
    ) ?? null
  );
}

/** Exposes the real headless openers (what ToolResultCanvasOpener calls). */
function mountOpeners(store: Store) {
  const api: { openers: CanvasOpeners | null } = { openers: null };
  function Probe() {
    api.openers = useCanvasOpeners();
    return null;
  }
  const mounted = mount(store, <Probe />);
  return { openers: api.openers!, unmount: mounted.unmount };
}

/** The focused pane's real tab strip + bodies. */
function PaneProbe() {
  const canvas = useCanvas();
  return (
    <TooltipProvider>
      <CanvasPaneView paneId={canvas.getState().focusedPaneId} />
    </TooltipProvider>
  );
}

function tabs(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'));
}

beforeEach(() => {
  toastError.mockClear();
  window.localStorage.clear();
});

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

  it("an offer lands on the canvas as a tab WITHOUT taking the screen", () => {
    const store = makeStore();
    const { openers, unmount } = mountOpeners(store);
    const offer = readToolResultCanvasOffer("document", CREATE_RESULT, {})!;
    act(() => {
      expect(openers.offer(offer.content)).toBe(true);
    });
    const items = itemsOf(store);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("udt_document");
    // By POINTER: the tab carries the document id, never a copy of the body.
    expect(contentOfItem(items[0])?.data).toEqual({ documentId: DOC_ID });
    // Offered, not opened: nothing at all changed on screen.
    expect(selectCanvasIsOpen(canvasOf(store))).toBe(false);

    // Offering the same record again is ONE tab, never two.
    act(() => {
      openers.offer(offer.content);
    });
    expect(itemsOf(store)).toHaveLength(1);
    unmount();
  });

  it("renders a card in the thread whose canvas action opens THAT document", () => {
    const store = makeStore(); // under the ONE canvas provider, as on every route
    const { container, unmount } = mount(
      store,
      <DocumentInline entry={entryWith(CREATE_RESULT)} />,
    );

    expect(container.textContent).toContain("Canvas Switcher Probe");
    const button = findCanvasButton(container);
    expect(button).not.toBeNull();

    act(() => button!.click());

    const items = itemsOf(store);
    expect(selectCanvasIsOpen(canvasOf(store))).toBe(true);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("udt_document");
    expect(items[0].title).toBe("Canvas Switcher Probe");
    expect(selectCanvasActiveItem(canvasOf(store))?.id).toBe(items[0].id);
    const content = contentOfItem(items[0]);
    expect(content?.type).toBe("udt_document");
    expect(content?.data).toEqual({ documentId: DOC_ID });
    expect(content?.metadata?.title).toBe("Canvas Switcher Probe");
    expect(toastError).not.toHaveBeenCalled();

    unmount();
  });

  it.each<[CanvasMode, string]>([
    ["none", "no canvas provider at all"],
    ["provider-only", "a provider but no column on screen"],
  ])(
    "announces a drop instead of doing nothing when no canvas is reachable (%s)",
    (mode) => {
      const store = makeStore();
      const { container, unmount } = mount(
        store,
        <DocumentInline entry={entryWith(CREATE_RESULT)} />,
        mode,
      );
      act(() => findCanvasButton(container)!.click());

      expect(itemsOf(store)).toHaveLength(0);
      expect(toastError).toHaveBeenCalledTimes(1);
      expect(String(toastError.mock.calls[0][0])).toContain(
        "Canvas Switcher Probe",
      );
      unmount();
    },
  );

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

  it("the canvas itself refuses to steal a tab the user is reading", () => {
    const store = makeStore();
    const { openers, unmount } = mountOpeners(store);
    act(() => {
      openers.open(SANDBOX);
      openers.offer(
        buildDocumentCanvasContent({ documentId: DOC_ID, title: "Doc" }),
      );
    });
    const active = selectCanvasActiveItem(canvasOf(store));
    expect(contentOfItem(active)?.type).toBe("sandbox");
    expect(itemsOf(store)).toHaveLength(2);
    unmount();
  });
});

// ── (c) the offered document is one click away ─────────────────────────────

describe("the tab strip", () => {
  it("draws a real, clickable tab per item that switches to the document", async () => {
    const store = makeStore();
    const { openers, unmount: unmountOpeners } = mountOpeners(store);
    act(() => {
      openers.open(SANDBOX);
      openers.offer(
        buildDocumentCanvasContent({
          documentId: DOC_ID,
          title: "Canvas Switcher Probe",
        }),
      );
    });
    unmountOpeners();

    const { container, unmount } = mount(store, <PaneProbe />);
    const strip = tabs(container);
    expect(strip.map((t) => t.textContent)).toEqual([
      "Sandbox",
      "Canvas Switcher Probe",
    ]);
    expect(strip[0].getAttribute("aria-selected")).toBe("true");
    expect(strip[1].getAttribute("aria-selected")).toBe("false");

    await act(async () => {
      strip[1].click();
    });
    expect(contentOfItem(selectCanvasActiveItem(canvasOf(store)))?.type).toBe(
      "udt_document",
    );
    expect(tabs(container)[1].getAttribute("aria-selected")).toBe("true");

    // The tab's body is the artifact kind's lazily loaded view → CanvasBody.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const body = container.querySelector<HTMLElement>(
      '.mxc-item[data-kind="udt_document"]',
    );
    expect(body).not.toBeNull();
    expect(body!.hidden).toBe(false);
    expect(body!.querySelector('[aria-busy="true"]')).toBeNull(); // loaded
    expect(body!.querySelector('[role="alert"]')).toBeNull(); // and rendered
    expect(body!.textContent).not.toContain("Unsupported content type");
    // CanvasBody routed the tab to the document editor, BY POINTER.
    expect(
      body!.querySelector('[data-testid="document-canvas-body"]')?.textContent,
    ).toBe(DOC_ID);
    unmount();
  });
});

// ── (d) the udt_document pane renders title + content from a fixture row ────

describe("the udt_document canvas type", () => {
  it("is a registered kind with its own title, and never persists a copy", () => {
    expect(getDefaultTitle("udt_document")).toBe("Document");
    // CanvasHostProvider registered it at import: a tab, never an unknown kind.
    const kind = getCanvasKind("udt_document");
    expect(kind?.label).toBe("Document");
    // A pointer to a durable row comes back after a reload.
    expect(kind?.restore).toBe(true);
    // The editor owns its own append-only snapshot history; a canvas_items row
    // would freeze a stale copy beside the live one.
    expect(isPersistableCanvasType("udt_document")).toBe(false);
  });

  it("still OFFERS a Source view — unlike the live panes", async () => {
    // A document is a pointer to a DURABLE authored record, so its markdown is
    // exactly what a person means by "Source".
    expect(canvasTypeHasSource("udt_document")).toBe(true);
    // The genuinely live surfaces have no source of their own.
    expect(canvasTypeHasSource("sandbox")).toBe(false);
    expect(canvasTypeHasSource("cloud_browser")).toBe(false);

    // …and the real tab header shows it: the artifact kind's own action.
    const store = makeStore();
    const api: { openers: CanvasOpeners | null } = { openers: null };
    function Opener() {
      api.openers = useCanvasOpeners();
      return null;
    }
    const { container, unmount } = mount(
      store,
      <>
        <Opener />
        <PaneProbe />
      </>,
    );
    act(() => {
      api.openers!.open(SANDBOX);
    });
    const sourceButton = () =>
      container.querySelector<HTMLButtonElement>('button[aria-label="Show source"]');
    expect(sourceButton()).toBeNull(); // the sandbox has none

    await act(async () => {
      api.openers!.open(
        buildDocumentCanvasContent({ documentId: DOC_ID, title: "Probe" }),
      );
    });
    expect(sourceButton()).not.toBeNull();
    await act(async () => {
      sourceButton()!.click();
    });
    const active = selectCanvasActiveItem(canvasOf(store));
    expect(active ? readArtifactItemData(active.data)?.view : null).toBe("source");
    unmount();
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
