const schema = jest.fn();
const listForSources = jest.fn();
const setTargets = jest.fn();
const invalidate = jest.fn();

jest.mock("@/utils/supabase/client", () => ({ supabase: { schema } }));
jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: { listForSources, setTargets },
}));
jest.mock("@/features/scopes/host/associationsStore", () => ({
  getAssociationsStore: () => ({ invalidate }),
}));

import type { NoteRow } from "../types";
import {
  NoteContextPartialSaveError,
  NoteUpdateConflictError,
} from "./noteSaveErrors";
import { persistNoteUpdate, updateNote } from "./notesService";

const ORGANIZATION_A = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION_B = "22222222-2222-4222-8222-222222222222";
const NOTE_ID = "33333333-3333-4333-8333-333333333333";
const PROJECT_ID = "44444444-4444-4444-8444-444444444444";
const TASK_ID = "55555555-5555-4555-8555-555555555555";

function noteRow(overrides: Partial<NoteRow> = {}): NoteRow {
  return {
    id: NOTE_ID,
    content: "before",
    content_hash: null,
    created_at: "2026-09-12T00:00:00.000Z",
    created_by: "user-1",
    deleted_at: null,
    file_path: null,
    folder_id: null,
    folder_name: null,
    label: "Original",
    last_device_id: null,
    metadata: {},
    organization_id: ORGANIZATION_A,
    position: 0,
    project_id: null,
    sync_version: 0,
    tags: [],
    task_id: null,
    updated_at: "2026-09-12T00:00:00.000Z",
    updated_by: null,
    version: 7,
    visibility: "personal",
    ...overrides,
  };
}

function query(result: unknown) {
  const chain = {
    select: jest.fn(),
    eq: jest.fn(),
    is: jest.fn(),
    maybeSingle: jest.fn(),
    update: jest.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.maybeSingle.mockResolvedValue(result);
  return chain;
}

describe("notesService versioned write convergence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listForSources.mockResolvedValue({ ok: true, data: { edges: [] } });
    setTargets.mockResolvedValue({ ok: true, data: null });
  });

  it("uses id, authorized organization, and version predicates for a captured revision", async () => {
    const existing = query({ data: noteRow(), error: null });
    const updated = query({ data: noteRow({ label: "After", version: 8 }), error: null });
    const from = jest.fn().mockReturnValueOnce(existing).mockReturnValueOnce(updated);
    schema.mockReturnValue({ from });
    const saved = await updateNote(NOTE_ID, { label: "After" }, {
      expectedVersion: 7,
      expectedOrganizationId: ORGANIZATION_A,
    });

    expect(updated.update).toHaveBeenCalledWith({ label: "After", version: 8 });
    expect(updated.eq).toHaveBeenCalledWith("id", NOTE_ID);
    expect(updated.eq).toHaveBeenCalledWith("organization_id", ORGANIZATION_A);
    expect(updated.eq).toHaveBeenCalledWith("version", 7);
    expect(saved.version).toBe(8);
  });

  it("returns a typed conflict with the complete current server row", async () => {
    const current = noteRow({ label: "Changed elsewhere", version: 9 });
    const existing = query({ data: noteRow(), error: null });
    const noMatch = query({ data: null, error: null });
    const currentQuery = query({ data: current, error: null });
    schema.mockReturnValue({
      from: jest.fn()
        .mockReturnValueOnce(existing)
        .mockReturnValueOnce(noMatch)
        .mockReturnValueOnce(currentQuery),
    });

    await expect(updateNote(NOTE_ID, { label: "Mine" }, { expectedVersion: 7 }))
      .rejects.toMatchObject({
        name: "NoteUpdateConflictError",
        expectedVersion: 7,
        currentVersion: 9,
        actualStoredNote: current,
      } satisfies Partial<NoteUpdateConflictError>);
    expect(currentQuery.eq).toHaveBeenCalledWith("id", NOTE_ID);
    expect(currentQuery.eq).toHaveBeenCalledWith("organization_id", ORGANIZATION_A);
  });

  it("classifies a full-row CAS miss as gone when its guarded reread has no row", async () => {
    const existing = query({ data: noteRow(), error: null });
    const noMatch = query({ data: null, error: null });
    const gone = query({ data: null, error: null });
    schema.mockReturnValue({
      from: jest.fn()
        .mockReturnValueOnce(existing)
        .mockReturnValueOnce(noMatch)
        .mockReturnValueOnce(gone),
    });

    await expect(updateNote(NOTE_ID, { label: "Mine" }, { expectedVersion: 7 }))
      .rejects.toThrow(/already be gone/i);
    expect(gone.eq).toHaveBeenCalledWith("id", NOTE_ID);
  });

  it("refuses a captured organization mismatch before folder admission or mutation", async () => {
    const existing = query({ data: noteRow({ organization_id: ORGANIZATION_B }), error: null });
    const from = jest.fn().mockReturnValue(existing);
    schema.mockReturnValue({ from });

    await expect(updateNote(NOTE_ID, { folder_id: PROJECT_ID }, {
      expectedOrganizationId: ORGANIZATION_A,
    })).rejects.toThrow(/different organization/i);

    expect(from).toHaveBeenCalledTimes(1);
    expect(existing.update).not.toHaveBeenCalled();
  });

  it("reports a saved database row and each failed context edge truthfully", async () => {
    const existing = query({ data: noteRow(), error: null });
    const updated = query({ data: noteRow({ label: "After", version: 8 }), error: null });
    schema.mockReturnValue({ from: jest.fn().mockReturnValueOnce(existing).mockReturnValueOnce(updated) });
    setTargets
      .mockResolvedValueOnce({ ok: true, data: null })
      .mockResolvedValueOnce({ ok: false, error: { message: "task denied" } });

    await expect(updateNote(NOTE_ID, {
      label: "After",
      project_id: PROJECT_ID,
      task_id: TASK_ID,
    })).rejects.toMatchObject({
      name: "NoteContextPartialSaveError",
      databaseWrite: "saved",
      actualStoredNote: expect.objectContaining({ label: "After", project_id: PROJECT_ID, task_id: null }),
      succeededFields: ["project_id"],
      failedFields: ["task_id"],
      safeCauses: { task_id: "task denied" },
    } satisfies Partial<NoteContextPartialSaveError>);
    expect(setTargets).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith("note", NOTE_ID);
  });

  it("does not call a context-only save a database write", async () => {
    const existing = query({ data: noteRow(), error: null });
    const unchanged = query({ data: noteRow(), error: null });
    schema.mockReturnValue({ from: jest.fn().mockReturnValueOnce(existing).mockReturnValueOnce(unchanged) });
    setTargets.mockResolvedValue({ ok: false, error: { message: "project denied" } });

    await expect(persistNoteUpdate(NOTE_ID, { project_id: PROJECT_ID }))
      .rejects.toMatchObject({
        databaseWrite: "unchanged",
        actualStoredNote: expect.objectContaining({ project_id: null }),
        succeededFields: [],
        failedFields: ["project_id"],
      } satisfies Partial<NoteContextPartialSaveError>);
    expect(unchanged.update).not.toHaveBeenCalled();
  });

  it("returns an unchanged receipt when context-only edges settle", async () => {
    const existing = query({ data: noteRow(), error: null });
    const unchanged = query({ data: noteRow(), error: null });
    schema.mockReturnValue({ from: jest.fn().mockReturnValueOnce(existing).mockReturnValueOnce(unchanged) });

    const receipt = await persistNoteUpdate(NOTE_ID, { project_id: PROJECT_ID });

    expect(receipt).toMatchObject({
      databaseWrite: "unchanged",
      note: expect.objectContaining({ project_id: PROJECT_ID }),
      succeededFields: ["project_id"],
      failedFields: [],
    });
  });

  it("keeps association field attribution when completions settle out of order", async () => {
    const existing = query({ data: noteRow(), error: null });
    const unchanged = query({ data: noteRow(), error: null });
    schema.mockReturnValue({ from: jest.fn().mockReturnValueOnce(existing).mockReturnValueOnce(unchanged) });
    setTargets.mockImplementation(({ targetType }: { targetType: string }) => {
      if (targetType === "project") {
        return new Promise((resolve) => setTimeout(() => resolve({ ok: true, data: null }), 5));
      }
      return Promise.reject(new Error("task rejected"));
    });

    await expect(persistNoteUpdate(NOTE_ID, { project_id: PROJECT_ID, task_id: TASK_ID }))
      .rejects.toMatchObject({
        actualStoredNote: expect.objectContaining({ project_id: PROJECT_ID, task_id: null }),
        succeededFields: ["project_id"],
        failedFields: ["task_id"],
        safeCauses: { task_id: "task rejected" },
      } satisfies Partial<NoteContextPartialSaveError>);
  });

  it("reports cache invalidation failure after a fully settled write without undoing it", async () => {
    const existing = query({ data: noteRow(), error: null });
    const updated = query({ data: noteRow({ label: "After" }), error: null });
    schema.mockReturnValue({ from: jest.fn().mockReturnValueOnce(existing).mockReturnValueOnce(updated) });
    invalidate.mockImplementation(() => { throw new Error("cache offline"); });

    const receipt = await persistNoteUpdate(NOTE_ID, { label: "After", project_id: PROJECT_ID });

    expect(receipt.note.project_id).toBe(PROJECT_ID);
    expect(receipt.postSaveRecoveryError).toMatchObject({ message: "cache offline" });
  });

  it("retains cache recovery evidence with a partial receipt", async () => {
    const existing = query({ data: noteRow(), error: null });
    const unchanged = query({ data: noteRow(), error: null });
    schema.mockReturnValue({ from: jest.fn().mockReturnValueOnce(existing).mockReturnValueOnce(unchanged) });
    setTargets
      .mockResolvedValueOnce({ ok: true, data: null })
      .mockResolvedValueOnce({ ok: false, error: { message: "task denied" } });
    invalidate.mockImplementation(() => { throw new Error("cache offline"); });

    await expect(persistNoteUpdate(NOTE_ID, { project_id: PROJECT_ID, task_id: TASK_ID }))
      .rejects.toMatchObject({
        receipt: expect.objectContaining({
          postSaveRecoveryError: expect.objectContaining({ message: "cache offline" }),
        }),
      });
  });

  it("fails association hydration before it attempts a mutation", async () => {
    const existing = query({ data: noteRow(), error: null });
    const from = jest.fn().mockReturnValue(existing);
    schema.mockReturnValue({ from });
    listForSources.mockResolvedValue({ ok: false, error: { message: "association read denied" } });

    await expect(persistNoteUpdate(NOTE_ID, { label: "After" }))
      .rejects.toThrow(/association read denied/i);
    expect(from).toHaveBeenCalledTimes(1);
    expect(existing.update).not.toHaveBeenCalled();
  });
});
