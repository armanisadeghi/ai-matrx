// Typing in a new note beside a LARGE notes list (the Write-mode freeze, 2026-10-10).
//
// Arman's account holds many notes. With every folder expanded the sidebar
// mounted one row per note — each a context menu, an item menu and a dozen
// Radix providers — and every save cycle of the note being typed (body,
// updated_at, label, settle) re-rendered the sidebar while the keys landed:
// 19 long tasks over 30s of typing, the longest 187ms (dev, 500 notes).
//
// A browser long-task count is too noisy for a unit suite, so this guards the
// two things that made those tasks long, as render COUNTS:
//   1. with 520 notes and every folder expanded, the sidebar mounts only the
//      rows in view (virtualised) — never one per note;
//   2. ten save cycles of the note being typed re-render at most a handful of
//      rows, never the list.
// Both fail on the unvirtualised sidebar (it mounts all 520 rows).

const rowRenders = new Map<string, number>();

jest.mock("@/utils/supabase/client", () => ({ supabase: { schema: jest.fn(), auth: {} } }));
jest.mock("@/lib/redux/slices/userSlice", () => ({
  selectUser: () => ({ id: "33333333-3333-4333-8333-333333333333" }),
  selectIsSuperAdmin: () => false,
  selectIsSuperAdminDebugger: () => false,
}));
jest.mock("@/components/matrx/Tooltip", () => ({ SimpleTooltip: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("@/features/notes/canvas/noteKnowledgeKind", () => ({ useOpenNoteKnowledgePanel: () => jest.fn() }));
jest.mock("@ai-matrx/media/react", () => ({
  useSpeech: () => ({ speak: jest.fn(), isSpeaking: false, stop: jest.fn() }),
}));
jest.mock("@ai-matrx/chat/surfaces/hooks/useSurfaceBoundAgents", () => ({
  useSurfaceBoundAgents: () => ({ sections: [], loading: false, error: null, hasAgents: false, refresh: jest.fn() }),
}));
jest.mock("../components/RenameFolderDialog", () => ({ RenameFolderDialog: () => null }));
jest.mock("../components/NoteSidebarBulkBar", () => ({ NoteSidebarBulkBar: () => null }));
// The REAL row (its memo is part of what is guarded); its heavy children are
// stand-ins, and ItemRow counts how often each row actually draws.
jest.mock("@ai-matrx/design-system/item", () => ({
  ItemRow: ({ entity }: { entity: { id: string } }) => {
    rowRenders.set(entity.id, (rowRenders.get(entity.id) ?? 0) + 1);
    return null;
  },
}));
jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({
  NonEditableContextMenu: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/features/commerce-review/components/OrganizationTag", () => ({ OrganizationTag: () => null }));
jest.mock("@/components/ui/checkbox", () => ({ Checkbox: () => null }));
jest.mock("../redux/thunks", () => {
  const actual = jest.requireActual<typeof import("../redux/thunks")>("../redux/thunks");
  return {
    ...actual,
    fetchNotesList: () => ({ type: "test/fetch-notes" }),
    fetchSharedNotesList: () => ({ type: "test/fetch-shared-notes" }),
    fetchAllNoteScopes: () => ({ type: "test/fetch-scopes" }),
    fetchNoteContent: () => ({ type: "test/fetch-note" }),
  };
});

import { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { enableMapSet } from "immer";
import { AlchemyActionsTestHost } from "@/test-utils/alchemy-actions-host";
import storeReadsReducer from "@/lib/redux/slices/storeReadsSlice";
import appContextReducer, { makeAppContextState } from "@/lib/redux/slices/appContextSlice";
import scopesTreeReducer from "@/features/scopes/redux/scopesSlice";
import userPreferencesReducer from "@/lib/redux/preferences/userPreferencesSlice";
import workingCopiesReducer from "@/lib/working-copy/workingCopySlice";
import overlaysReducer from "@/lib/redux/slices/overlaySlice";
import adminDebugReducer from "@/lib/redux/preferences/adminDebugSlice";
import notesReducer, {
  addInstanceTab,
  registerInstance,
  setInstanceActiveTab,
  setListStatus,
  updateNoteLabel,
  upsertNotesFromServer,
} from "../redux/slice";
import { NoteSidebar } from "../components/NoteSidebar";

enableMapSet();
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: () => ({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() }),
});
Object.defineProperty(HTMLElement.prototype, "scrollTo", { writable: true, value: jest.fn() });

// A laid-out sidebar: the list scroller is 700px tall, a row 26px.
const rect = (height: number) => ({ x: 0, y: 0, top: 0, left: 0, right: 260, bottom: height, width: 260, height, toJSON: () => ({}) });
jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
  return (this.hasAttribute("data-index") ? rect(26) : rect(700)) as DOMRect;
});
Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  get(this: HTMLElement) { return this.hasAttribute("data-index") ? 26 : 700; },
});
Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 260 });

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "33333333-3333-4333-8333-333333333333";
const NOTE_COUNT = 520;
const noteId = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;

function serverNote(i: number, updatedAt: string) {
  const folder = i % 40;
  return {
    id: noteId(i),
    created_by: USER,
    label: `Clinic note ${i}`,
    content: `Intake details ${i}`,
    folder_name: `Practice folder ${folder}`,
    folder_id: `00000000-0000-4000-9000-${String(folder).padStart(12, "0")}`,
    organization_id: ORG,
    tags: [],
    updated_at: updatedAt,
    position: i,
    published_to_web: false,
    version: 1,
  };
}

function minutesAgo(n: number): string {
  return new Date(Date.UTC(2026, 9, 10, 12, 0, 0) - n * 60_000).toISOString();
}

function largeStore() {
  const store = configureStore({
    reducer: {
      notes: notesReducer,
      storeReads: storeReadsReducer,
      appContext: appContextReducer,
      scopesTree: scopesTreeReducer,
      userPreferences: userPreferencesReducer,
      userAuth: (state: { id: string } = { id: USER }) => state,
      workingCopies: workingCopiesReducer,
      overlays: overlaysReducer,
      adminDebug: adminDebugReducer,
    },
    preloadedState: { appContext: makeAppContextState({ organization_id: ORG, orgBootstrapResolved: true }) },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(upsertNotesFromServer({
    upserts: Array.from({ length: NOTE_COUNT }, (_, i) => ({ note: serverNote(i, minutesAgo(i + 1)), fetchStatus: "list" as const })),
  }));
  store.dispatch(setListStatus("loaded"));
  store.dispatch(registerInstance("big"));
  return store;
}

describe("typing in a note beside a sidebar of 500+ notes", () => {
  it("mounts only the rows in view and re-renders almost none of them while the note saves", async () => {
    const store = largeStore();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<Provider store={store}><AlchemyActionsTestHost><NoteSidebar instanceId="big" /></AlchemyActionsTestHost></Provider>);
    });

    // Every folder open — the state that froze the browser.
    const expandAll = host.querySelector<HTMLButtonElement>('button[aria-label="Expand or collapse all folders"]');
    expect(expandAll).not.toBeNull();
    await act(async () => { expandAll!.click(); });
    expect(host.querySelectorAll('button[aria-expanded="true"]').length).toBeGreaterThan(0);

    // 1. Only what fits (plus overscan) is mounted — never one row per note…
    const mounted = host.querySelectorAll("[data-note-id]").length;
    expect(mounted).toBeGreaterThan(0);
    expect(mounted).toBeLessThanOrEqual(80);
    // …while the list still holds every note (40 headers + 520 rows of height).
    const list = host.querySelector<HTMLElement>("[data-virtual-list]");
    expect(parseFloat(list?.style.height ?? "0")).toBeGreaterThanOrEqual((NOTE_COUNT + 40) * 20);

    // The person opens the newest note and types: ten save cycles move its
    // body, updated_at and auto-label.
    const typed = noteId(0);
    await act(async () => {
      store.dispatch(addInstanceTab({ instanceId: "big", noteId: typed }));
      store.dispatch(setInstanceActiveTab({ instanceId: "big", noteId: typed }));
    });
    rowRenders.clear();
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        store.dispatch(upsertNotesFromServer({
          upserts: [{ note: { ...serverNote(0, `2026-10-10T12:00:${String(10 + i).padStart(2, "0")}Z`), content: `Typed paragraph ${i}` }, fetchStatus: "full" as const }],
        }));
        store.dispatch(updateNoteLabel({ id: typed, label: `Typed paragraph ${i}` }));
      });
    }

    // 2. Ten save cycles re-render a handful of rows (the typed note's own
    //    rows), never the list.
    const rerendered = [...rowRenders.values()].reduce((sum, n) => sum + n, 0);
    expect(rerendered).toBeLessThanOrEqual(10 * 4);
    expect(new Set(rowRenders.keys()).size).toBeLessThanOrEqual(4);

    await act(async () => { root.unmount(); });
    host.remove();
  });
});
