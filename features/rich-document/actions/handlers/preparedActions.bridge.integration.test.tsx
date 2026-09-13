
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

jest.mock("@/utils/supabase/client", () => ({ supabase: { schema: mockSchema, auth: { getSession: mockGetSession } } }));
jest.mock("@/utils/auth/getUserId", () => ({ requireUserId: () => "user-1" }));
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
import { NoteContextPartialSaveError } from "@/features/notes/service/noteSaveErrors";
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
  return { id: ID, organization_id: ORG, version: 0, content: "authoritative full body", label: "Note", folder_name: null, folder_id: null, tags: [], metadata: {}, visibility: "personal", position: 0, project_id: null, task_id: null, created_at: "2026-09-12T00:00:00Z", created_by: "user-1", updated_at: "2026-09-12T00:00:00Z", updated_by: "user-1", deleted_at: null, content_hash: null, file_path: null, last_device_id: null, sync_version: 0, ...overrides };
}
function query(result: unknown) {
  const chain = { select: jest.fn(), eq: jest.fn(), is: jest.fn(), maybeSingle: jest.fn(), update: jest.fn() };
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.is.mockReturnValue(chain); chain.update.mockReturnValue(chain); chain.maybeSingle.mockResolvedValue(result); return chain;
}
function makeStore() {
  const baseReducer = createSlimRootReducer();
  const reducer = (state: RootState | undefined, action: UnknownAction): RootState => {
    const next = baseReducer(state, action);
    return action.type === "test/seed" ? { ...next, userAuth: { ...next.userAuth, id: "user-1", authReady: true } } : next;
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
    dispatch: store.dispatch as AppDispatch, organizationId: ORG, isAuthenticated: true, isAdmin: false, isCreator: false,
    surfaceKey: null, onClose: () => {}, instanceKey: (prefix) => `note:${prefix}`, sourceAdapter: noteAdapter,
    extensions: { type: "note", isOwner: true },
  };
}

describe("registered Notes actions through overlay and rendered bridge", () => {
  let container: HTMLDivElement; let root: Root;
  beforeEach(() => {
    jest.clearAllMocks(); editorProps = null; htmlPreviewProps = null; container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "user-1" } } }, error: null }); mockListForSources.mockResolvedValue({ ok: true, data: { edges: [] } }); mockSetTargets.mockResolvedValue({ ok: true, data: null });
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

  it.each(["edit", "open-fullscreen-editor"])("prepares identity source before %s overlay and saves via real adapter/service", async (id) => {
    const read = query({ data: note(), error: null }); const existing = query({ data: note(), error: null });
    const write = query({ data: note({ content: "saved full body", version: 1 }), error: null });
    mockSchema.mockReturnValue({ from: jest.fn().mockReturnValueOnce(read).mockReturnValueOnce(existing).mockReturnValueOnce(write) });
    const store = makeStore(); const action = getAction(id); if (!action) throw new Error("registered action missing");
    await action.run(context(store));
    const instanceId = id === "edit" ? "note:edit-content" : "note:fullscreen-editor";
    const overlay = store.getState().overlays.overlays.fullScreenEditor?.[instanceId];
    if (!overlay || !isFullScreenOverlayData(overlay.data)) throw new Error("overlay did not open with a callback target");
    const overlayData = overlay.data;
    expect(overlayData.content).toBe("authoritative full body");
    expect(read.eq).toHaveBeenCalledWith("id", ID);
    await act(async () => root.render(<Provider store={store}><FullScreenMarkdownEditorBridge isOpen onClose={() => {}} instanceId={instanceId} content={overlayData.content} callbackGroupId={overlayData.callbackGroupId} /></Provider>));
    if (!editorProps) throw new Error("rendered bridge missing visual editor");
    await editorProps.onSave("saved full body");
    expect(write.update).toHaveBeenCalledWith({ content: "saved full body", version: 1 });
    expect(write.eq).toHaveBeenCalledWith("id", ID); expect(write.eq).toHaveBeenCalledWith("organization_id", ORG); expect(write.eq).toHaveBeenCalledWith("version", 0);
  });

  it("uses a dirty captured base without a save-time reread", async () => {
    const existing = query({ data: note({ content: "acknowledged", version: 4 }), error: null });
    const write = query({ data: note({ content: "second dirty body", version: 5 }), error: null });
    mockSchema.mockReturnValue({ from: jest.fn().mockReturnValueOnce(existing).mockReturnValueOnce(write) });
    const source = captureNoteEditSource({ acknowledgedNote: note({ content: "acknowledged", version: 4 }), displayedNote: note({ content: "first dirty body", version: 4 }), actorId: "user-1", sourceId: "dirty", snapshotId: "dirty-1" });
    const store = makeStore(); const action = getAction("edit"); if (!action) throw new Error("registered action missing");
    await action.run(context(store, source));
    const overlay = store.getState().overlays.overlays.fullScreenEditor?.["note:edit-content"];
    if (!overlay || !isFullScreenOverlayData(overlay.data)) throw new Error("missing prepared overlay");
    const overlayData = overlay.data;
    expect(overlayData.content).toBe("first dirty body");
    expect(mockSchema).not.toHaveBeenCalledWith(expect.anything());
    await act(async () => root.render(<Provider store={store}><FullScreenMarkdownEditorBridge isOpen onClose={() => {}} instanceId="note:edit-content" content={overlayData.content} callbackGroupId={overlayData.callbackGroupId} /></Provider>));
    if (!editorProps) throw new Error("missing rendered editor"); await editorProps.onSave("second dirty body");
    expect(write.eq).toHaveBeenCalledWith("version", 4);
  });

  it("keeps the HTML bridge's real hook and callback open for a second acknowledged save", async () => {
    const read = query({ data: note(), error: null });
    const firstExisting = query({ data: note(), error: null });
    const firstWrite = query({ data: note({ content: "first HTML save", version: 1 }), error: null });
    const secondExisting = query({ data: note({ content: "first HTML save", version: 1 }), error: null });
    const secondWrite = query({ data: note({ content: "second HTML save", version: 2 }), error: null });
    mockSchema.mockReturnValue({
      from: jest.fn()
        .mockReturnValueOnce(read)
        .mockReturnValueOnce(firstExisting)
        .mockReturnValueOnce(firstWrite)
        .mockReturnValueOnce(secondExisting)
        .mockReturnValueOnce(secondWrite),
    });
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
    expect(firstWrite.eq).toHaveBeenCalledWith("version", 0);
    expect(secondWrite.eq).toHaveBeenCalledWith("version", 1);
  });

  it("refuses an identity opening when authentication changes while the authoritative row is loading", async () => {
    const read = query({ data: note(), error: null });
    mockSchema.mockReturnValue({ from: jest.fn().mockReturnValue(read) });
    mockGetSession
      .mockResolvedValueOnce({ data: { session: { user: { id: "user-1" } } }, error: null })
      .mockResolvedValueOnce({ data: { session: { user: { id: "user-2" } } }, error: null });
    const store = makeStore(); const action = getAction("edit"); if (!action) throw new Error("registered action missing");
    await expect(action.run(context(store))).rejects.toThrow(/sign-in changed/i);
    expect(store.getState().overlays.overlays.fullScreenEditor?.["note:edit-content"]).toBeUndefined();
  });

  it("labels injected unchanged association receipts as protocol faults without relabeling a content write", async () => {
    // This deliberately replaces only the adapter return with a separately
    // real context-only operation. The no-spy tests above cover the actual
    // content adapter; this proves the common callback protocol for an
    // unchanged association acknowledgement without claiming it saved content.
    const firstExisting = query({ data: note({ content: "protocol body", version: 4 }), error: null });
    const firstRead = query({ data: note({ content: "protocol body", version: 4 }), error: null });
    const secondExisting = query({ data: note({ content: "later body", version: 4 }), error: null });
    const secondRead = query({ data: note({ content: "later body", version: 4 }), error: null });
    mockSchema.mockReturnValue({ from: jest.fn().mockReturnValueOnce(firstExisting).mockReturnValueOnce(firstRead).mockReturnValueOnce(secondExisting).mockReturnValueOnce(secondRead) });
    const source = captureNoteEditSource({ acknowledgedNote: note({ content: "base", version: 4 }), displayedNote: note({ content: "dirty retained", version: 4 }), actorId: "user-1", sourceId: "protocol", snapshotId: "protocol:4" });
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
      await htmlPreviewProps.onSave("later body");
      // The injected unchanged acknowledgement kept the private base at 4.
      expect(adapterSpy).toHaveBeenCalledTimes(2);
    } finally {
      adapterSpy.mockRestore();
    }
  });

  it("keeps a valid physical acknowledgement private when an injected context partial rejects", async () => {
    const contextExisting = query({ data: note({ content: "partial body", version: 4 }), error: null });
    const contextRead = query({ data: note({ content: "partial body", version: 4 }), error: null });
    mockSchema.mockReturnValue({ from: jest.fn().mockReturnValueOnce(contextExisting).mockReturnValueOnce(contextRead) });
    mockSetTargets.mockResolvedValueOnce({ ok: false, error: { message: "project denied" } });
    let partial: NoteContextPartialSaveError | null = null;
    try { await persistNoteUpdate(ID, { project_id: "project-1" }); } catch (error) { partial = error as NoteContextPartialSaveError; }
    expect(partial).toBeInstanceOf(NoteContextPartialSaveError);

    const source = captureNoteEditSource({ acknowledgedNote: note({ content: "base", version: 4 }), displayedNote: note({ content: "dirty", version: 4 }), actorId: "user-1", sourceId: "partial", snapshotId: "partial:4" });
    const adapterSpy = jest.spyOn(noteAdapter, "edit").mockImplementation(async (args) => { expect(args.source).toMatchObject({ mode: "editable", editBase: { version: 4 } }); throw partial!; });
    try {
      const store = makeStore(); const action = getAction("edit"); if (!action) throw new Error("registered action missing");
      await action.run(context(store, source));
      const overlay = store.getState().overlays.overlays.fullScreenEditor?.["note:edit-content"];
      if (!overlay || !isFullScreenOverlayData(overlay.data)) throw new Error("missing partial overlay");
      const overlayData = overlay.data;
      await act(async () => root.render(<Provider store={store}><FullScreenMarkdownEditorBridge isOpen onClose={() => {}} instanceId="note:edit-content" content={overlayData.content} callbackGroupId={overlayData.callbackGroupId} /></Provider>));
      if (!editorProps) throw new Error("missing partial callback");
      await expect(editorProps.onSave("partial body")).rejects.toBe(partial);
      expect(adapterSpy).toHaveBeenCalledTimes(1);
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
