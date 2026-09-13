
const mockSchema = jest.fn();
const mockGetSession = jest.fn();
const mockListForSources = jest.fn();
const mockSetTargets = jest.fn();
const mockInvalidate = jest.fn();
let editorProps: { onSave: (content: string) => Promise<void>; initialContent: string } | null = null;

jest.mock("@/utils/supabase/client", () => ({ supabase: { schema: mockSchema, auth: { getSession: mockGetSession } } }));
jest.mock("@/utils/auth/getUserId", () => ({ requireUserId: () => "user-1" }));
jest.mock("@/features/scopes/service/associationsService", () => ({ associationsService: { listForSources: mockListForSources, setTargets: mockSetTargets } }));
jest.mock("@/features/scopes/host/associationsStore", () => ({ getAssociationsStore: () => ({ invalidate: mockInvalidate, services: { comments: new Proxy({}, { get: () => () => { throw new Error("unexpected comments transport"); } }), categories: new Proxy({}, { get: () => () => { throw new Error("unexpected categories transport"); } }) } }) }));
jest.mock("next/dynamic", () => () => (props: typeof editorProps) => { editorProps = props; return <div />; });

import React, { act } from "react";
import { Provider } from "react-redux";
import { configureStore, type UnknownAction } from "@reduxjs/toolkit";
import { createRoot, type Root } from "react-dom/client";
import { enableMapSet } from "immer";
import { createSlimRootReducer, type RootState } from "@/lib/redux/rootReducer";
import type { AppDispatch } from "@/lib/redux/store";
import type { Note } from "@/features/notes/types";
import type { RichDocumentActionContext } from "../../types";
import { noteIdentityContentSource } from "@/features/notes/richDocumentSource";
import { noteAdapter } from "../sources/note";
import { getAction } from "../registry";
import { FullScreenMarkdownEditorBridge } from "@/components/mardown-display/chat-markdown/FullScreenMarkdownEditorBridge";

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
function context(store: ReturnType<typeof makeStore>): RichDocumentActionContext {
  return {
    content: "selection only", source: noteIdentityContentSource(ID, "identity-source"), metadata: null,
    dispatch: store.dispatch as AppDispatch, organizationId: ORG, isAuthenticated: true, isAdmin: false, isCreator: false,
    surfaceKey: null, onClose: () => {}, instanceKey: (prefix) => `note:${prefix}`, sourceAdapter: noteAdapter,
    extensions: { type: "note", isOwner: true },
  };
}

describe("registered Notes actions through overlay and rendered bridge", () => {
  let container: HTMLDivElement; let root: Root;
  beforeEach(() => {
    jest.clearAllMocks(); editorProps = null; container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
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
});

function isFullScreenOverlayData(value: unknown): value is { content: string; callbackGroupId: string } {
  return typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).content === "string" && typeof (value as Record<string, unknown>).callbackGroupId === "string";
}
