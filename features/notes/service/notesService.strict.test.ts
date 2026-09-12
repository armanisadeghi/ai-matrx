const schema = jest.fn();
const requireUserId = jest.fn();
const listForSources = jest.fn();
const setTargets = jest.fn();

jest.mock("@/utils/supabase/client", () => ({ supabase: { schema } }));
jest.mock("@/utils/auth/getUserId", () => ({ requireUserId }));
jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: { listForSources, setTargets },
}));

import type { NoteRow } from "../types";
import { updateNote } from "./notesService";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const NOTE_ID = "22222222-2222-4222-8222-222222222222";
const FOLDER_ID = "33333333-3333-4333-8333-333333333333";

function noteRow(overrides: Partial<NoteRow> = {}): NoteRow {
  return {
    id: NOTE_ID,
    content: "",
    content_hash: null,
    created_at: "2026-09-12T00:00:00.000Z",
    created_by: "user-1",
    deleted_at: null,
    file_path: null,
    folder_id: FOLDER_ID,
    folder_name: "Historical name",
    label: "New Note",
    last_device_id: null,
    metadata: {},
    organization_id: ORGANIZATION_ID,
    position: 0,
    project_id: null,
    sync_version: 0,
    tags: [],
    task_id: null,
    updated_at: "2026-09-12T00:00:00.000Z",
    updated_by: null,
    version: 1,
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

describe("notesService persisted-folder boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireUserId.mockReturnValue("user-1");
    listForSources.mockResolvedValue({ ok: true, data: { edges: [] } });
    setTargets.mockResolvedValue({ ok: true });
  });

  it("rejects a name-only persisted move before folder creation or note mutation", async () => {
    const existing = query({ data: { organization_id: ORGANIZATION_ID }, error: null });
    const from = jest.fn().mockReturnValue(existing);
    schema.mockReturnValue({ from });

    // External clients can bypass TypeScript, so the service must still reject
    // this malformed persisted relationship at runtime.
    const untypedUpdate = JSON.parse('{"folder_name":"Same name"}');
    await expect(updateNote(NOTE_ID, untypedUpdate)).rejects.toThrow(/admitted folder ID/i);

    expect(from).toHaveBeenCalledTimes(1);
    expect(existing.update).not.toHaveBeenCalled();
  });

  it("uses the admitted folder name and captured organization for a persisted move", async () => {
    const existing = query({ data: { organization_id: ORGANIZATION_ID }, error: null });
    const folder = query({ data: { id: FOLDER_ID, name: "Authoritative name" }, error: null });
    const write = query({ data: noteRow({ folder_name: "Authoritative name" }), error: null });
    const from = jest.fn().mockReturnValueOnce(existing).mockReturnValueOnce(folder).mockReturnValueOnce(write);
    schema.mockReturnValue({ from });

    await updateNote(NOTE_ID, { folder_id: FOLDER_ID });

    expect(write.update).toHaveBeenCalledWith({ folder_id: FOLDER_ID, folder_name: "Authoritative name" });
    expect(write.eq).toHaveBeenCalledWith("organization_id", ORGANIZATION_ID);
  });

  it("rejects an unavailable folder from another organization without a note write", async () => {
    const existing = query({ data: { organization_id: ORGANIZATION_ID }, error: null });
    const unavailable = query({ data: null, error: null });
    const from = jest.fn().mockReturnValueOnce(existing).mockReturnValueOnce(unavailable);
    schema.mockReturnValue({ from });

    await expect(updateNote(NOTE_ID, { folder_id: FOLDER_ID })).rejects.toThrow(/unavailable/i);

    expect(from).toHaveBeenCalledTimes(2);
    expect(unavailable.update).not.toHaveBeenCalled();
  });

  it("unfiles with a null display name and preserves ordinary edits on historical mismatches", async () => {
    const existing = query({ data: { organization_id: ORGANIZATION_ID }, error: null });
    const unfileWrite = query({ data: noteRow({ folder_id: null, folder_name: null }), error: null });
    const editExisting = query({ data: { organization_id: ORGANIZATION_ID }, error: null });
    const editWrite = query({ data: noteRow({ label: "Edited" }), error: null });
    const from = jest.fn()
      .mockReturnValueOnce(existing)
      .mockReturnValueOnce(unfileWrite)
      .mockReturnValueOnce(editExisting)
      .mockReturnValueOnce(editWrite);
    schema.mockReturnValue({ from });

    await updateNote(NOTE_ID, { folder_id: null });
    await updateNote(NOTE_ID, { label: "Edited" });

    expect(unfileWrite.update).toHaveBeenCalledWith({ folder_id: null, folder_name: null });
    expect(editWrite.update).toHaveBeenCalledWith({ label: "Edited" });
  });
});
