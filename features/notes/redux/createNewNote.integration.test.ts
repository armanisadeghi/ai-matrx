const schema = jest.fn();
const getUserId = jest.fn();
const listForSources = jest.fn();
const setTargets = jest.fn();
const invalidate = jest.fn();

jest.mock("@/utils/supabase/client", () => ({ supabase: { schema } }));
jest.mock("@/utils/auth/getUserId", () => ({ requireUserId: getUserId }));
jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: { listForSources, setTargets },
}));
jest.mock("@/features/scopes/host/associationsStore", () => ({
  getAssociationsStore: () => ({ invalidate }),
}));

import { configureStore } from "@reduxjs/toolkit";
import notesReducer from "./slice";
import { createNewNote } from "./thunks";
import { createNote } from "../service/notesService";
import { NoteContextPartialSaveError } from "../service/noteSaveErrors";

const organizationId = "11111111-1111-4111-8111-111111111111";
const folderId = "22222222-2222-4222-8222-222222222222";
const noteId = "33333333-3333-4333-8333-333333333333";
const projectId = "44444444-4444-4444-8444-444444444444";
const taskId = "55555555-5555-4555-8555-555555555555";

function query(result: unknown) {
  const chain = {
    select: jest.fn(),
    eq: jest.fn(),
    is: jest.fn(),
    order: jest.fn(),
    maybeSingle: jest.fn(),
    update: jest.fn(),
    insert: jest.fn(),
    single: jest.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.insert.mockReturnValue(chain);
  chain.single.mockResolvedValue(result);
  chain.order.mockResolvedValue(result);
  chain.maybeSingle.mockResolvedValue(result);
  return chain;
}

describe("createNewNote empty-note reuse integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getUserId.mockReturnValue("user-1");
    setTargets.mockResolvedValue({ ok: true });
    invalidate.mockReset();
  });

  it("surfaces a partial create receipt instead of hydrating it as a full success", async () => {
    const folder = query({ data: { id: folderId, name: "Draft" }, error: null });
    const inserted = query({ data: {
      id: noteId, label: "Created", content: "body", folder_id: folderId, folder_name: "Draft",
      organization_id: organizationId, version: 1, updated_at: "2026-09-12T00:00:00.000Z",
    }, error: null });
    schema.mockReturnValue({ from: jest.fn().mockReturnValueOnce(folder).mockReturnValueOnce(inserted) });
    listForSources.mockResolvedValue({ ok: true, data: { edges: [] } });
    setTargets
      .mockResolvedValueOnce({ ok: true, data: null })
      .mockResolvedValueOnce({ ok: false, error: { message: "task denied" } });

    const store = configureStore({
      reducer: { notes: notesReducer, userAuth: () => ({ id: "user-1" }) },
    });
    const action = await store.dispatch(createNewNote({
      organization_id: organizationId, folder_id: folderId, folder_name: "Draft", label: "Created", content: "body",
      project_id: projectId, task_id: taskId,
    }));
    expect(createNewNote.rejected.match(action)).toBe(true);
    expect(action.error.message).toMatch(/one or more context links/i);
    expect(store.getState().notes.notes[noteId]).toBeUndefined();
  });

  it("returns a created note when cache recovery follows durable context settlement", async () => {
    const folder = query({ data: { id: folderId, name: "Draft" }, error: null });
    const inserted = query({ data: {
      id: noteId, label: "Created", content: "body", folder_id: folderId, folder_name: "Draft",
      organization_id: organizationId, version: 1, updated_at: "2026-09-12T00:00:00.000Z",
    }, error: null });
    schema.mockReturnValue({ from: jest.fn().mockReturnValueOnce(folder).mockReturnValueOnce(inserted) });
    listForSources.mockResolvedValue({ ok: true, data: { edges: [] } });
    invalidate.mockImplementation(() => { throw new Error("cache offline"); });

    await expect(createNote({
      organization_id: organizationId, folder_id: folderId, folder_name: "Draft", label: "Created", content: "body", project_id: projectId,
    })).resolves.toMatchObject({ id: noteId, project_id: projectId });
  });

  it("forwards every explicit reuse field through update, association sync, and Redux tab hydration", async () => {
    const folder = query({ data: { id: folderId, name: "Draft" }, error: null });
    const reused = {
      id: noteId,
      label: "New Note",
      content: "",
      folder_id: folderId,
      folder_name: "Draft",
      organization_id: organizationId,
      deleted_at: null,
    };
    const reuseLookup = query({ data: [reused], error: null });
    const existingOrganization = query({ data: { organization_id: organizationId }, error: null });
    const updated = {
      ...reused,
      label: "Incident handoff",
      metadata: { source: "war-room" },
      position: 7,
      visibility: "link",
    };
    const update = query({ data: updated, error: null });
    update.select.mockReturnValue(update);

    const from = jest
      .fn()
      .mockReturnValueOnce(folder)
      .mockReturnValueOnce(reuseLookup)
      .mockReturnValueOnce(existingOrganization)
      .mockReturnValueOnce(update);
    schema.mockReturnValue({ from });
    listForSources
      .mockResolvedValueOnce({ ok: true, data: { edges: [] } })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          edges: [
            { sourceId: noteId, targetType: "project", targetId: projectId },
            { sourceId: noteId, targetType: "task", targetId: taskId },
          ],
        },
      });

    const store = configureStore({
      reducer: {
        notes: notesReducer,
        userAuth: () => ({ id: "user-1" }),
      },
    });
    const action = await store.dispatch(createNewNote({
      organization_id: organizationId,
      folder_id: folderId,
      folder_name: "Draft",
      label: "Incident handoff",
      metadata: { source: "war-room" },
      position: 7,
      visibility: "link",
      project_id: projectId,
      task_id: taskId,
    }));

    if (!createNewNote.fulfilled.match(action)) {
      throw new Error("Expected empty-note reuse to hydrate the created note.");
    }
    expect(update.update).toHaveBeenCalledWith({
      label: "Incident handoff",
      metadata: { source: "war-room" },
      position: 7,
      visibility: "link",
    });
    expect(setTargets).toHaveBeenNthCalledWith(1, {
      sourceType: "note",
      sourceId: noteId,
      targetType: "project",
      targetIds: [projectId],
      orgId: organizationId,
    });
    expect(setTargets).toHaveBeenNthCalledWith(2, {
      sourceType: "note",
      sourceId: noteId,
      targetType: "task",
      targetIds: [taskId],
      orgId: organizationId,
    });
    expect(store.getState().notes.notes[noteId]).toMatchObject({
      label: "Incident handoff",
      metadata: { source: "war-room" },
      position: 7,
      visibility: "link",
      project_id: projectId,
      task_id: taskId,
      _fetchStatus: "full",
    });
    expect(store.getState().notes.openTabs).toContain(noteId);
    expect(store.getState().notes.activeNoteId).toBe(noteId);
  });

  it("keeps existing context links untouched when a reused create omits them", async () => {
    const folder = query({ data: { id: folderId, name: "Draft" }, error: null });
    const reused = {
      id: noteId,
      label: "New Note",
      content: "",
      folder_id: folderId,
      folder_name: "Draft",
      organization_id: organizationId,
      deleted_at: null,
    };
    const reuseLookup = query({ data: [reused], error: null });
    const from = jest.fn().mockReturnValueOnce(folder).mockReturnValueOnce(reuseLookup);
    schema.mockReturnValue({ from });
    listForSources.mockResolvedValue({
      ok: true,
      data: {
        edges: [
          { sourceId: noteId, targetType: "project", targetId: projectId },
          { sourceId: noteId, targetType: "task", targetId: taskId },
        ],
      },
    });
    const store = configureStore({
      reducer: {
        notes: notesReducer,
        userAuth: () => ({ id: "user-1" }),
      },
    });

    const action = await store.dispatch(createNewNote({
      organization_id: organizationId,
      folder_id: folderId,
      folder_name: "Draft",
    }));

    if (!createNewNote.fulfilled.match(action)) {
      throw new Error("Expected the omitted-field reuse to return the existing note.");
    }
    expect(from).toHaveBeenCalledTimes(2);
    expect(setTargets).not.toHaveBeenCalled();
    expect(store.getState().notes.notes[noteId]).toMatchObject({
      project_id: projectId,
      task_id: taskId,
      _fetchStatus: "full",
    });
  });
});
