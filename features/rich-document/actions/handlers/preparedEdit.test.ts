import {
  NoteContextPartialSaveError,
  NotePostAcknowledgementError,
  type NoteSaveReceipt,
} from "@/features/notes/service/noteSaveErrors";
import { captureNoteEditSource } from "@/features/notes/richDocumentSource";
import type { Note } from "@/features/notes/types";
import { acknowledgedPreparedSource, savePreparedContentEdit } from "./preparedEdit";

const note = (overrides: Partial<Note> = {}): Note => ({
  id: "33333333-3333-4333-8333-333333333333", organization_id: "11111111-1111-4111-8111-111111111111",
  version: 0, content: "base", label: "Note", folder_name: null, folder_id: null, tags: [], metadata: {},
  visibility: "personal", position: 0, project_id: null, task_id: null, created_at: "2026-09-12T00:00:00Z",
  created_by: "actor", updated_at: "2026-09-12T00:00:00Z", updated_by: "actor", deleted_at: null,
  content_hash: null, file_path: null, last_device_id: null, sync_version: 0, ...overrides,
});
const source = () => captureNoteEditSource({ acknowledgedNote: note(), displayedNote: note({ content: "dirty" }), actorId: "actor", sourceId: "editor", snapshotId: "snapshot" });
const receipt = (overrides: Partial<NoteSaveReceipt> = {}): NoteSaveReceipt => ({ note: note({ content: "saved", version: 1 }), databaseWrite: "saved", succeededFields: [], failedFields: [], safeCauses: {}, ...overrides });

describe("prepared Notes receipt settlement", () => {
  const ctx = (edit: (args: { newContent: string }) => Promise<NoteSaveReceipt>) => ({
    sourceAdapter: { edit: async ({ newContent }: { newContent: string }) => edit({ newContent }), instanceKeyPrefix: () => "note" },
    dispatch: jest.fn(), source: source(), content: "dirty", isAuthenticated: true,
  }) as never;

  it("requires an actual matching receipt and keeps wrong or void results from becoming success", async () => {
    await expect(savePreparedContentEdit({ ctx: ctx(async () => undefined as never), source: source(), newContent: "saved" })).rejects.toThrow(/receipt/i);
    await expect(savePreparedContentEdit({ ctx: ctx(async () => receipt({ note: note({ content: "other", version: 1 }) })), source: source(), newContent: "saved" })).rejects.toThrow(/does not match/i);
  });

  it("advances only callback-local receipt state after a saved partial or post-acknowledgement failure", async () => {
    const partial = new NoteContextPartialSaveError(receipt({ failedFields: ["task_id"] }));
    const settledPartial = acknowledgedPreparedSource(source(), partial, "saved");
    expect(settledPartial).toMatchObject({ type: "note", mode: "editable", editBase: { version: 1 } });
    const postAck = new NotePostAcknowledgementError({ receipt: receipt(), actorId: "actor", sourceId: "editor", snapshotId: "snapshot", kind: "actor-changed-after-ack", cause: new Error("changed") });
    expect(acknowledgedPreparedSource(source(), postAck, "saved")).toMatchObject({ editBase: { version: 1 } });
  });

  it("does not advance an unacknowledged CAS error or accept a receipt for another org", () => {
    expect(acknowledgedPreparedSource(source(), new Error("CAS refused"), "saved")).toBeNull();
    expect(() => acknowledgedPreparedSource(source(), new NoteContextPartialSaveError(receipt({ note: note({ organization_id: "22222222-2222-4222-8222-222222222222", content: "saved", version: 1 }) })), "saved")).toThrow(/does not match/i);
  });
});
