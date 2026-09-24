import { withClaims } from "@/test-utils/supabase-auth";

const mockSchema = jest.fn();
const mockGetSession = jest.fn();
const mockListForSources = jest.fn();
const mockSetTargets = jest.fn();
const mockInvalidate = jest.fn();
let editorProps: { onSave: (content: string) => Promise<void>; initialContent: string } | null = null;
let htmlPreviewProps: {
  onSave?: (content: string) => Promise<void>;
  htmlPreviewState: { currentMarkdown: string };
} | null = null;

jest.mock("@/utils/supabase/client", () => ({ supabase: { schema: mockSchema, auth: withClaims({ getSession: mockGetSession }) } }));
jest.mock("@/utils/auth/getUserId", () => ({ requireUserId: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }));
jest.mock("@/features/scopes/service/associationsService", () => ({ associationsService: { listForSources: mockListForSources, setTargets: mockSetTargets } }));
jest.mock("@/features/scopes/host/associationsStore", () => ({ getAssociationsStore: () => ({ invalidate: mockInvalidate, services: { comments: new Proxy({}, { get: () => () => { throw new Error("unexpected comments transport"); } }), categories: new Proxy({}, { get: () => () => { throw new Error("unexpected categories transport"); } }) } }) }));
jest.mock("next/dynamic", () => () => (props: typeof editorProps) => { editorProps = props; return <div />; });
// Keep the visual child isolated while running HtmlPreviewBridge and its real
// useHtmlPreviewState hook. The save channel under test is the bridge callback.
jest.mock("@/features/html-pages/components/HtmlPreviewFullScreenEditor", () => ({
  __esModule: true,
  default: (props: typeof htmlPreviewProps) => {
    htmlPreviewProps = props;
    return <div data-testid="html-preview-visual-child" />;
  },
}));

import React, { act } from "react";
import { Provider } from "react-redux";
import { configureStore, type UnknownAction } from "@reduxjs/toolkit";
import { createRoot, type Root } from "react-dom/client";
import { enableMapSet } from "immer";
import { createSlimRootReducer, type RootState } from "@/lib/redux/rootReducer";
import type { AppDispatch } from "@/lib/redux/store";
import type { Note } from "@/features/notes/types";
import { persistNoteUpdate } from "@/features/notes/service/notesService";
import { NoteContextPartialSaveError, NotePostAcknowledgementError } from "@/features/notes/service/noteSaveErrors";
import type { RichDocumentActionContext } from "../../types";
import { captureNoteEditSource, noteIdentityContentSource } from "@/features/notes/richDocumentSource";
import { noteAdapter } from "../sources/note";
import { getAction } from "../registry";
import { FullScreenMarkdownEditorBridge } from "@/components/mardown-display/chat-markdown/FullScreenMarkdownEditorBridge";
import { HtmlPreviewBridge } from "@/features/cx-conversation/components/HtmlPreviewBridge";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import "./edit";
import "./export";
import "./fullscreen-editor";

enableMapSet();
const ORG = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";
function note(overrides: Partial<Note> = {}): Note {
  return { id: ID, organization_id: ORG, version: 0, content: "authoritative full body", label: "Note", folder_name: null, folder_id: null, tags: [], metadata: {}, custom_fields: {}, visibility: "personal", position: 0, project_id: null, task_id: null, created_at: "2026-09-12T00:00:00Z", created_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", updated_at: "2026-09-12T00:00:00Z", updated_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", deleted_at: null, content_hash: null, file_path: null, last_device_id: null, sync_version: 0, ...overrides };
}
/**
 * A `workbench.notes` stub that answers by INTENT — table + filters +
 * operation — never by call ORDER.
 *
 * WHY, and never go back to a queue: this replaces a `query()` helper whose
 * every caller strung `mockSchema.mockReturnValue({ from: jest.fn()
 * .mockReturnValueOnce(a).mockReturnValueOnce(b)... })` — the same
 * call-order-keyed shape `features/notes/redux/draftInitialization.control
 * .integration.test.tsx` carried before `abe5da8907` closed it there. A note
 * flow's real read/write count is not fixed by this test file: `prepareEdit`
 * skips the network read entirely for an already-captured dirty source, and
 * a CAS miss makes `guardedUpdate` issue an extra `fetchCurrent` read this
 * suite never has to enumerate by hand. A queue that assumed a fixed count
 * would silently answer the WRONG call with the RIGHT-shaped data the moment
 * that assumption drifted, and never say so.
 *
 * This stub instead holds the one row the flow actually touches and answers
 * every `select`/`update` against its real current state, CAS included: a
 * filtered `update` whose filters miss the stored row returns
 * `{ data: null }`, exactly as PostgREST does, so a wrong expected version
 * produces a genuine miss rather than a rehearsed acknowledgement.
 */
interface NotesIntentChain {
  select: jest.Mock<NotesIntentChain, [string?]>;
  eq: jest.Mock<NotesIntentChain, [string, unknown]>;
  is: jest.Mock<NotesIntentChain, [string, unknown]>;
  update: jest.Mock<NotesIntentChain, [Record<string, unknown>]>;
  maybeSingle: jest.Mock<Promise<{ data: Record<string, unknown> | null; error: null }>, []>;
}
function notesRowByIntent(initial: Note) {
  let row: Record<string, unknown> = { ...initial };
  const writes: Array<{ payload: Record<string, unknown>; filters: Map<string, unknown> }> = [];
  const from = jest.fn((table: string) => {
    if (table !== "notes") {
      throw new Error(`This stub models workbench.notes only; \`${table}\` was read.`);
    }
    const filters = new Map<string, unknown>();
    let payload: Record<string, unknown> | null = null;
    const matches = () =>
      [...filters].every(([column, value]) => (row[column] ?? null) === (value ?? null));
    const chain: NotesIntentChain = {
      select: jest.fn(() => chain),
      eq: jest.fn((column: string, value: unknown) => { filters.set(column, value); return chain; }),
      is: jest.fn((column: string, value: unknown) => { filters.set(column, value); return chain; }),
      update: jest.fn((values: Record<string, unknown>) => { payload = { ...values }; return chain; }),
      maybeSingle: jest.fn(async () => {
        if (payload) {
          writes.push({ payload, filters: new Map(filters) });
          if (!matches()) return { data: null, error: null };
          row = { ...row, ...payload };
          return { data: { ...row }, error: null };
        }
        if (!matches()) return { data: null, error: null };
        return { data: { ...row }, error: null };
      }),
    };
    return chain;
  });
  return {
    from,
    /** Every write ATTEMPT, matched or not — the CAS filters it carried. */
    writes,
    /** The stored row, as the database would hold it right now. */
    row: () => ({ ...row }),
    /** Something else moved the row without going through this stub's `.update()`. */
    advance: (patch: Record<string, unknown>) => { row = { ...row, ...patch }; },
  };
}

function makeStore() {
  const baseReducer = createSlimRootReducer();
  const reducer = (state: RootState | undefined, action: UnknownAction): RootState => {
    const next = baseReducer(state, action);
    return action.type === "test/seed" ? { ...next, userAuth: { ...next.userAuth, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", authReady: true } } : next;
  };
  const store = configureStore({ reducer, middleware: (gdm) => gdm({ serializableCheck: false }) });
  store.dispatch({ type: "test/seed", payload: null });
  return store;
}
function context(
  store: ReturnType<typeof makeStore>,
  source: RichDocumentActionContext["source"] = noteIdentityContentSource(ID, "identity-source"),
): RichDocumentActionContext {
  return {
    content: "selection only", source, metadata: null,
    dispatch: store.dispatch as AppDispatch, getState: store.getState, organizationId: ORG, isAuthenticated: true, isAdmin: false, isCreator: false,
    surfaceKey: null, onClose: () => {}, instanceKey: (prefix) => `note:${prefix}`, sourceAdapter: noteAdapter,
    extensions: { type: "note", isOwner: true },
  };
}

describe("registered Notes actions through overlay and rendered bridge", () => {
  let container: HTMLDivElement; let root: Root;
  beforeEach(() => {
    jest.clearAllMocks(); editorProps = null; htmlPreviewProps = null; container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } } }, error: null }); mockListForSources.mockResolvedValue({ ok: true, data: { edges: [] } }); mockSetTargets.mockResolvedValue({ ok: true, data: null });
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

  it.each(["edit", "open-fullscreen-editor"])("prepares identity source before %s overlay and saves via real adapter/service", async (id) => {
    const server = notesRowByIntent(note());
    mockSchema.mockReturnValue({ from: server.from });
    const store = makeStore(); const action = getAction(id); if (!action) throw new Error("registered action missing");
    await action.run(context(store));
    const instanceId = id === "edit" ? "note:edit-content" : "note:fullscreen-editor";
    const overlay = store.getState().overlays.overlays.fullScreenEditor?.[instanceId];
    if (!overlay || !isFullScreenOverlayData(overlay.data)) throw new Error("overlay did not open with a callback target");
    const overlayData = overlay.data;
    expect(overlayData.content).toBe("authoritative full body");
    expect(server.from.mock.results[0]?.value.eq).toHaveBeenCalledWith("id", ID);
    await act(async () => root.render(<Provider store={store}><FullScreenMarkdownEditorBridge isOpen onClose={() => {}} instanceId={instanceId} content={overlayData.content} callbackGroupId={overlayData.callbackGroupId} /></Provider>));
    if (!editorProps) throw new Error("rendered bridge missing visual editor");
    await editorProps.onSave("saved full body");
    const write = server.writes.at(-1);
    expect(write?.payload).toEqual({ content: "saved full body", version: 1 });
    expect(write?.filters.get("id")).toBe(ID); expect(write?.filters.get("organization_id")).toBe(ORG); expect(write?.filters.get("version")).toBe(0);
    expect(server.row()).toMatchObject({ content: "saved full body", version: 1 });
  });

  it("uses a dirty captured base without a save-time reread", async () => {
    const server = notesRowByIntent(note({ content: "acknowledged", version: 4 }));
    mockSchema.mockReturnValue({ from: server.from });
    const source = captureNoteEditSource({ acknowledgedNote: note({ content: "acknowledged", version: 4 }), displayedNote: note({ content: "first dirty body", version: 4 }), actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sourceId: "dirty", snapshotId: "dirty-1" });
    const store = makeStore(); const action = getAction("edit"); if (!action) throw new Error("registered action missing");
    await action.run(context(store, source));
    const overlay = store.getState().overlays.overlays.fullScreenEditor?.["note:edit-content"];
    if (!overlay || !isFullScreenOverlayData(overlay.data)) throw new Error("missing prepared overlay");
    const overlayData = overlay.data;
    expect(overlayData.content).toBe("first dirty body");
    expect(mockSchema).not.toHaveBeenCalledWith(expect.anything());
    await act(async () => root.render(<Provider store={store}><FullScreenMarkdownEditorBridge isOpen onClose={() => {}} instanceId="note:edit-content" content={overlayData.content} callbackGroupId={overlayData.callbackGroupId} /></Provider>));
    if (!editorProps) throw new Error("missing rendered editor"); await editorProps.onSave("second dirty body");
    const write = server.writes.at(-1);
    expect(write?.filters.get("version")).toBe(4);
    expect(server.row()).toMatchObject({ content: "second dirty body", version: 5 });
  });

  it("keeps the HTML bridge's real hook and callback open for a second acknowledged save", async () => {
    const server = notesRowByIntent(note());
    mockSchema.mockReturnValue({ from: server.from });
    const store = makeStore(); const action = getAction("html-preview"); if (!action) throw new Error("registered action missing");
    await action.run(context(store));
    const overlay = store.getState().overlays.overlays.htmlPreview?.["note:html-preview"];
    if (!overlay || !isHtmlPreviewOverlayData(overlay.data)) throw new Error("HTML overlay did not open with a callback target");
    expect(overlay.data.content).toBe("authoritative full body");
    const overlayData = overlay.data;
    await act(async () => root.render(<Provider store={store}><HtmlPreviewBridge content={overlayData.content} callbackGroupId={overlayData.callbackGroupId} onClose={() => {}} showSaveButton /></Provider>));
    if (!htmlPreviewProps?.onSave) throw new Error("actual HTML bridge did not pass a save callback to its visual child");
    expect(htmlPreviewProps.htmlPreviewState.currentMarkdown).toBe("authoritative full body");
    await htmlPreviewProps.onSave("first HTML save");
    await htmlPreviewProps.onSave("second HTML save");
    expect(server.writes[0]?.filters.get("version")).toBe(0);
    expect(server.writes[1]?.filters.get("version")).toBe(1);
    expect(server.row()).toMatchObject({ content: "second HTML save", version: 2 });
  });

  it("refuses an identity opening when authentication changes while the authoritative row is loading", async () => {
    const server = notesRowByIntent(note());
    mockSchema.mockReturnValue({ from: server.from });
    mockGetSession
      .mockResolvedValueOnce({ data: { session: { user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } } }, error: null })
      .mockResolvedValueOnce({ data: { session: { user: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } } }, error: null });
    const store = makeStore(); const action = getAction("edit"); if (!action) throw new Error("registered action missing");
    await expect(action.run(context(store))).rejects.toThrow(/sign-in changed/i);
    expect(store.getState().overlays.overlays.fullScreenEditor?.["note:edit-content"]).toBeUndefined();
  });

  it("refuses a moved note before a prepared editor can write into another organization", async () => {
    const movedOrganization = "99999999-9999-4999-8999-999999999999";
    const server = notesRowByIntent(note({ organization_id: movedOrganization, version: 5 }));
    mockSchema.mockReturnValue({ from: server.from });
    const source = captureNoteEditSource({ acknowledgedNote: note({ version: 4 }), displayedNote: note({ content: "dirty retained", version: 4 }), actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sourceId: "moved", snapshotId: "moved:4" });
    const store = makeStore(); const action = getAction("edit"); if (!action) throw new Error("registered action missing");
    await action.run(context(store, source));
    const overlay = store.getState().overlays.overlays.fullScreenEditor?.["note:edit-content"];
    if (!overlay || !isFullScreenOverlayData(overlay.data)) throw new Error("missing moved-note editor");
    const overlayData = overlay.data;
    await act(async () => root.render(<Provider store={store}><FullScreenMarkdownEditorBridge isOpen onClose={() => {}} instanceId="note:edit-content" content={overlayData.content} callbackGroupId={overlayData.callbackGroupId} /></Provider>));
    if (!editorProps) throw new Error("missing moved-note callback");
    await expect(editorProps.onSave("attempted overwrite")).rejects.toThrow(/different organization/i);
    expect(server.writes).toHaveLength(0);
    expect(store.getState().overlays.overlays.fullScreenEditor?.["note:edit-content"]).toBeDefined();
  });

  it("keeps a stale dirty base when the remote revision advanced before save", async () => {
    const server = notesRowByIntent(note({ content: "remote version five", version: 5 }));
    mockSchema.mockReturnValue({ from: server.from });
    const source = captureNoteEditSource({
      acknowledgedNote: note({ content: "acknowledged at four", version: 4 }),
      displayedNote: note({ content: "dirty retained", version: 4 }),
      actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sourceId: "stale-base", snapshotId: "stale-base:4",
    });
    const store = makeStore(); const action = getAction("edit"); if (!action) throw new Error("registered action missing");
    await action.run(context(store, source));
    const overlay = store.getState().overlays.overlays.fullScreenEditor?.["note:edit-content"];
    if (!overlay || !isFullScreenOverlayData(overlay.data)) throw new Error("missing stale-base editor");
    const overlayData = overlay.data;
    await act(async () => root.render(<Provider store={store}><FullScreenMarkdownEditorBridge isOpen onClose={() => {}} instanceId="note:edit-content" content={overlayData.content} callbackGroupId={overlayData.callbackGroupId} /></Provider>));
    if (!editorProps) throw new Error("missing stale-base callback");
    await expect(editorProps.onSave("attempted stale overwrite")).rejects.toThrow(/changed elsewhere/i);
    expect(server.writes).toHaveLength(1);
    expect(server.writes[0]?.filters.get("version")).toBe(4);
    expect(server.row()).toMatchObject({ version: 5, content: "remote version five" });
    expect(store.getState().overlays.overlays.fullScreenEditor?.["note:edit-content"]).toBeDefined();
  });

  it("labels injected unchanged association receipts as protocol faults without relabeling a content write", async () => {
    // This deliberately replaces only the adapter return with a separately
    // real context-only operation. The no-spy tests above cover the actual
    // content adapter; this proves the common callback protocol for an
    // unchanged association acknowledgement without claiming it saved content.
    // `noteAdapter.edit` is replaced below to call `persistNoteUpdate` with a
    // context-only update (`project_id` alone) — `databaseUpdates` ends up
    // empty, so the service never issues a `.update()`, only its unconditional
    // existing-read and its post-context re-read of the same unchanged row.
    const server = notesRowByIntent(note({ content: "protocol body", version: 4 }));
    mockSchema.mockReturnValue({ from: server.from });
    const source = captureNoteEditSource({ acknowledgedNote: note({ content: "base", version: 4 }), displayedNote: note({ content: "dirty retained", version: 4 }), actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sourceId: "protocol", snapshotId: "protocol:4" });
    const adapterSpy = jest.spyOn(noteAdapter, "edit").mockImplementation(async (args) => {
      expect(args.source).toMatchObject({ mode: "editable", editBase: { version: 4 } });
      return persistNoteUpdate(ID, { project_id: "project-1" });
    });
    try {
      const store = makeStore(); const action = getAction("html-preview"); if (!action) throw new Error("registered action missing");
      await action.run(context(store, source));
      const overlay = store.getState().overlays.overlays.htmlPreview?.["note:html-preview"];
      if (!overlay || !isHtmlPreviewOverlayData(overlay.data)) throw new Error("missing HTML protocol overlay");
      const overlayData = overlay.data;
      await act(async () => root.render(<Provider store={store}><HtmlPreviewBridge content={overlayData.content} callbackGroupId={overlayData.callbackGroupId} onClose={() => {}} showSaveButton /></Provider>));
      if (!htmlPreviewProps?.onSave) throw new Error("missing HTML protocol callback");
      await htmlPreviewProps.onSave("protocol body");
      // The adapter override above never writes content through this stub —
      // it only ever calls persistNoteUpdate's context-only path. Advancing
      // the stored row's content here (never through `.update()`) is what
      // makes the SECOND save's submitted physical content ("later body")
      // match what the overridden adapter's receipt reports back, exactly
      // as a real prior content save between the two calls would have.
      server.advance({ content: "later body" });
      await htmlPreviewProps.onSave("later body");
      // The injected unchanged acknowledgement kept the private base at 4.
      expect(adapterSpy).toHaveBeenCalledTimes(2);
    } finally {
      adapterSpy.mockRestore();
    }
  });

  it("keeps a returned saved physical partial receipt as the callback-local retry base", async () => {
    // ONE stored row carries both the direct call below and the later
    // rendered retry — the retry's real existing-read must see the version
    // the direct call actually left behind (5), never a rehearsed 5.
    const server = notesRowByIntent(note({ content: "base", version: 4 }));
    mockSchema.mockReturnValue({ from: server.from });
    mockSetTargets.mockResolvedValueOnce({ ok: false, error: { message: "project denied" } });
    let partial: NoteContextPartialSaveError | null = null;
    try {
      await persistNoteUpdate(ID, { content: "partial body", project_id: "project-1" }, {
        expectedVersion: 4, expectedOrganizationId: ORG, expectedActorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expectedSourceId: "partial", expectedSnapshotId: "partial:4",
      });
    } catch (error) { partial = error as NoteContextPartialSaveError; }
    expect(partial).toBeInstanceOf(NoteContextPartialSaveError);
    expect(partial?.receipt).toMatchObject({ databaseWrite: "saved", note: { version: 5, content: "partial body" } });
    expect(server.row()).toMatchObject({ version: 5, content: "partial body" });

    const source = captureNoteEditSource({ acknowledgedNote: note({ content: "base", version: 4 }), displayedNote: note({ content: "dirty", version: 4 }), actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sourceId: "partial", snapshotId: "partial:4" });
    const originalEdit = noteAdapter.edit!;
    const adapterSpy = jest.spyOn(noteAdapter, "edit").mockImplementation(async (args) => {
      if (adapterSpy.mock.calls.length === 1) return partial!.receipt;
      return originalEdit(args);
    });
    try {
      const store = makeStore(); const action = getAction("edit"); if (!action) throw new Error("registered action missing");
      await action.run(context(store, source));
      const overlay = store.getState().overlays.overlays.fullScreenEditor?.["note:edit-content"];
      if (!overlay || !isFullScreenOverlayData(overlay.data)) throw new Error("missing partial overlay");
      const overlayData = overlay.data;
      await act(async () => root.render(<Provider store={store}><FullScreenMarkdownEditorBridge isOpen onClose={() => {}} instanceId="note:edit-content" content={overlayData.content} callbackGroupId={overlayData.callbackGroupId} /></Provider>));
      if (!editorProps) throw new Error("missing partial callback");
      await expect(editorProps.onSave("partial body")).rejects.toBeInstanceOf(NoteContextPartialSaveError);
      await editorProps.onSave("retry body");
      expect(adapterSpy.mock.calls[0]?.[0].source).toMatchObject({ mode: "editable", editBase: { version: 4 } });
      expect(adapterSpy.mock.calls[1]?.[0].source).toMatchObject({ mode: "editable", editBase: { version: 5 } });
      const retryWrite = server.writes.at(-1);
      expect(retryWrite?.filters.get("version")).toBe(5);
      expect(server.row()).toMatchObject({ content: "retry body", version: 6 });
    } finally {
      adapterSpy.mockRestore();
    }
  });

  it("retains an acknowledged base after an actor changes after the physical write", async () => {
    const server = notesRowByIntent(note({ content: "base", version: 4 }));
    mockSchema.mockReturnValue({ from: server.from });
    mockGetSession
      .mockResolvedValueOnce({ data: { session: { user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } } }, error: null })
      .mockResolvedValueOnce({ data: { session: { user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } } }, error: null })
      .mockResolvedValueOnce({ data: { session: { user: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } } }, error: null })
      .mockResolvedValue({ data: { session: { user: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } } }, error: null });
    const source = captureNoteEditSource({ acknowledgedNote: note({ content: "base", version: 4 }), displayedNote: note({ content: "dirty", version: 4 }), actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sourceId: "actor-change", snapshotId: "actor-change:4" });
    const originalEdit = noteAdapter.edit!;
    const adapterSpy = jest.spyOn(noteAdapter, "edit").mockImplementation((args) => originalEdit(args));
    try {
      const store = makeStore(); const action = getAction("edit"); if (!action) throw new Error("registered action missing");
      await action.run(context(store, source));
      const overlay = store.getState().overlays.overlays.fullScreenEditor?.["note:edit-content"];
      if (!overlay || !isFullScreenOverlayData(overlay.data)) throw new Error("missing actor-change overlay");
      const overlayData = overlay.data;
      await act(async () => root.render(<Provider store={store}><FullScreenMarkdownEditorBridge isOpen onClose={() => {}} instanceId="note:edit-content" content={overlayData.content} callbackGroupId={overlayData.callbackGroupId} /></Provider>));
      if (!editorProps) throw new Error("missing actor-change callback");
      await expect(editorProps.onSave("saved before actor change")).rejects.toBeInstanceOf(NotePostAcknowledgementError);
      await expect(editorProps.onSave("retry after actor change")).rejects.toThrow(/sign-in changed/i);
      expect(adapterSpy.mock.calls[0]?.[0].source).toMatchObject({ mode: "editable", editBase: { version: 4 } });
      expect(adapterSpy.mock.calls[1]?.[0].source).toMatchObject({ mode: "editable", editBase: { version: 5 } });
      expect(server.writes[0]?.filters.get("version")).toBe(4);
      expect(server.row()).toMatchObject({ content: "saved before actor change", version: 5 });
    } finally {
      adapterSpy.mockRestore();
    }
  });
});

function isFullScreenOverlayData(value: unknown): value is { content: string; callbackGroupId: string } {
  return typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).content === "string" && typeof (value as Record<string, unknown>).callbackGroupId === "string";
}

function isHtmlPreviewOverlayData(value: unknown): value is { content: string; callbackGroupId: string } {
  return isFullScreenOverlayData(value);
}
