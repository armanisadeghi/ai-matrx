/**
 * ONE DOCUMENT, MANY VIEWS — a cloud document is one in-memory model per tab;
 * every DocumentEditor is a view of it.
 *
 * Breaks that turn these red:
 *  - an editor that rebuilds from the SERVER copy on remount (a board tile
 *    waking, a removed tile undone) while its last edit is still unsaved —
 *    the edit disappears from the screen and the next save writes over it;
 *  - two editors of one document that do not share edits (each holds and
 *    saves its own copy: last write wins);
 *  - a save per view instead of one per document.
 *
 * Univer itself is replaced by a small stand-in with the same seams the
 * editor uses (createUniver → facade + injector → ICommandService), whose
 * "document" is a text and whose one mutation inserts text. Everything the
 * editor and the model own runs for real; the network (document-service) is
 * stubbed with a server holding one snapshot.
 */

// ── Univer stand-in ──────────────────────────────────────────────────────────
type Info = { id: string; type: number; params: { text?: string } | null };
type Listener = (info: Info, options?: Record<string, unknown>) => void;

class FakeInstance {
  data: { id: string; body: { dataStream: string } } | null = null;
  collab = new Set<Listener>();
  executed = new Set<(info: Info) => void>();
  disposed = false;
  commandService = {
    onMutationExecutedForCollab: (listener: Listener) => {
      this.collab.add(listener);
      return { dispose: () => this.collab.delete(listener) };
    },
    onCommandExecuted: (listener: (info: Info) => void) => {
      this.executed.add(listener);
      return { dispose: () => this.executed.delete(listener) };
    },
    syncExecuteCommand: (id: string, params: Info["params"], options?: Record<string, unknown>) => {
      if (!this.data) throw new Error("no document unit");
      if (params?.text) this.data.body.dataStream = this.data.body.dataStream.replace(/\r\n$/, `${params.text}\r\n`);
      const info = { id, type: 2, params };
      for (const l of Array.from(this.collab)) l(info, options);
      for (const l of Array.from(this.executed)) l(info);
      return true;
    },
  };
  /** A person typing in this view. */
  type(text: string) {
    this.commandService.syncExecuteCommand("doc.mutation.rich-text-editing", { text });
  }
  text() {
    return this.data?.body.dataStream.replace(/\r\n$/, "") ?? null;
  }
}

const instances: FakeInstance[] = [];

jest.mock("@univerjs/presets", () => ({
  LocaleType: { EN_US: "en-US" },
  merge: (a: object) => a,
  createUniver: () => {
    const instance = new FakeInstance();
    instances.push(instance);
    const univer = {
      __getInjector: () => ({ get: () => instance.commandService }),
      dispose: () => {
        instance.disposed = true;
      },
    };
    const univerAPI = {
      createDocument: (data: { id: string; body: { dataStream: string } }) => {
        instance.data = JSON.parse(JSON.stringify(data));
        return { getId: () => data.id };
      },
      getActiveDocument: () =>
        instance.data
          ? {
              getId: () => instance.data!.id,
              save: () => JSON.parse(JSON.stringify(instance.data)),
              getBody: () => instance.data!.body,
            }
          : null,
      // The old editor's autosave listened here.
      Event: { CommandExecuted: "CommandExecuted" },
      addEvent: (_event: string, cb: (info: Info) => void) => instance.commandService.onCommandExecuted(cb),
    };
    return { univer, univerAPI };
  },
}));
jest.mock("@univerjs/core", () => ({
  CommandType: { COMMAND: 0, OPERATION: 1, MUTATION: 2 },
  ICommandService: Symbol("ICommandService"),
  createParagraphId: () => "p1",
  createSectionId: () => "s1",
}));
jest.mock("@univerjs/themes", () => ({ defaultTheme: {} }));
jest.mock("@univerjs/preset-docs-core", () => ({ UniverDocsCorePreset: () => ({}) }));
jest.mock("@univerjs/preset-docs-core/locales/en-US", () => ({}));
jest.mock("@univerjs/preset-sheets-core", () => ({ DragManagerService: class {}, HoverManagerService: class {} }));
jest.mock("@ai-matrx/realtime/react", () => ({ useRealtimeManager: () => null, useChannel: () => undefined }));
jest.mock("@ai-matrx/realtime", () => ({
  defineChannelNamespace: () => ({ topic: () => "udt-document-snapshots:x" }),
}));
jest.mock("@/features/canvas/host/toolCanvas", () => ({
  ...jest.requireActual<typeof import("@/features/canvas/host/toolCanvas")>("@/features/canvas/host/toolCanvas"),
  useToolToggle: () => ({ isVisible: false, toggle: () => {} }),
}));
jest.mock("@/lib/univer/useUniverDarkModeSync", () => ({ useUniverDarkModeSync: () => {} }));
jest.mock("@/features/documents/hooks/useUniverDocSurfaceTheme", () => ({ useUniverDocSurfaceTheme: () => {} }));
jest.mock("@/features/documents/univer-doc-canvas-colors", () => ({ renderDocumentCanvasColorsVerbatim: () => ({ applied: true }) }));
jest.mock("@/lib/univer/registerUniverFacadeDependencies", () => ({ registerUniverFacadeDependencies: () => {} }));
jest.mock("@/features/documents/utils/sanitizeUniverDocSnapshot", () => ({ sanitizeUniverDocSnapshot: (s: unknown) => s }));
jest.mock("@/lib/univer/disposeUniverInstance", () => ({
  disposeUniverInstance: (u: { dispose: () => void } | null) => u?.dispose(),
}));
jest.mock("@/lib/collab/RemoteCursorsLayer", () => ({ RemoteCursorsLayer: () => null }));
jest.mock("@/features/documents/components/DocumentPageReferenceCopyButton", () => ({ DocumentPageReferenceCopyButton: () => null }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/components/ui/use-toast", () => ({ toast: jest.fn() }));
jest.mock("@/styles/themes/useThemeMode", () => ({ useThemeMode: () => "light" }));
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/utils/supabase/claimsUser", () => ({
  getClaimsUser: async () => ({ data: { user: { id: "user-potter" } } }),
}));

// ── the server: one stored snapshot; saves stay in flight until released ──
const SERVER_TEXT = "Kiln log: cone 6 firing, 9 hours.";
const saves: string[] = [];
const pendingSaves: Array<() => void> = [];
jest.mock("@/features/documents/document-service", () => ({
  getLatestDocumentSnapshot: async () => ({
    success: true,
    data: { id: "snap-server", snapshot: { id: "unit-kiln", body: { dataStream: `${SERVER_TEXT}\r\n` } } },
  }),
  saveDocumentSnapshot: (args: { snapshot: { body: { dataStream: string } } }) => {
    saves.push(args.snapshot.body.dataStream.replace(/\r\n$/, ""));
    return new Promise((resolve) => {
      pendingSaves.push(() => resolve({ success: true, data: { id: `snap-${saves.length}`, created_by: "user-potter" } }));
    });
  },
}));

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import workingCopiesReducer from "@/lib/working-copy/workingCopySlice";
import DocumentEditor from "@/features/documents/components/DocumentEditor";
import { openDocumentModelIds } from "@/features/documents/document-model/documentModels";

const DOC = "7e1f0c2a-4b5d-4e6f-8a9b-0c1d2e3f4a5b";

function makeStore() {
  return configureStore({ reducer: { workingCopies: workingCopiesReducer } });
}

async function settle() {
  for (let i = 0; i < 10; i += 1) await act(async () => { await Promise.resolve(); });
}

async function mountView(store: ReturnType<typeof makeStore>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(
      <Provider store={store}>
        <DocumentEditor documentId={DOC} editable />
      </Provider>,
    );
  });
  await settle();
  const instance = instances[instances.length - 1];
  return {
    instance,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["queueMicrotask", "nextTick"] });
  saves.length = 0;
  pendingSaves.length = 0;
  instances.length = 0;
});
afterEach(async () => {
  for (const finish of pendingSaves.splice(0)) finish();
  await settle();
  // Every view gone and every save landed → the document is kept warm for a
  // returning view, then dropped (no leak; a later open reads the server).
  await act(async () => {
    jest.advanceTimersByTime(10 * 60_000);
  });
  expect(openDocumentModelIds()).toEqual([]);
  jest.useRealTimers();
});

describe("a document open in several views", () => {
  it("a remount shows the last edit, not the server copy, while that edit is still saving", async () => {
    const store = makeStore();
    const tile = await mountView(store);
    expect(tile.instance.text()).toBe(SERVER_TEXT);

    tile.instance.type(" Glaze test tiles on shelf 2.");
    await tile.unmount(); // the tile falls asleep / is removed, inside the 2.5s window

    const woken = await mountView(store);
    try {
      expect(woken.instance.text()).toBe(`${SERVER_TEXT} Glaze test tiles on shelf 2.`);
      // The edit was written once, with the typed text.
      expect(saves).toEqual([`${SERVER_TEXT} Glaze test tiles on shelf 2.`]);
    } finally {
      await woken.unmount();
    }
  });

  it("two views of one document show each other's edits and save once", async () => {
    const store = makeStore();
    const board = await mountView(store);
    const page = await mountView(store);
    try {
      board.instance.type(" Shelf 3: celadon bowls.");
      expect(page.instance.text()).toBe(`${SERVER_TEXT} Shelf 3: celadon bowls.`);

      page.instance.type(" Unload Thursday.");
      expect(board.instance.text()).toBe(`${SERVER_TEXT} Shelf 3: celadon bowls. Unload Thursday.`);

      await act(async () => {
        jest.advanceTimersByTime(2600);
      });
      await settle();
      expect(saves).toEqual([`${SERVER_TEXT} Shelf 3: celadon bowls. Unload Thursday.`]);
    } finally {
      await board.unmount();
      await page.unmount();
    }
  });
});
