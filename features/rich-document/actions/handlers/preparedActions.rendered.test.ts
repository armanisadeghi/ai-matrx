import { emitFullScreenEditorSave } from "@/features/overlays/callbacks/fullScreenEditor";
import { getAction } from "../registry";
import type { RichDocumentActionContext } from "../../types";

jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/lib/redux/slices/overlaySlice", () => ({ openOverlay: (payload: unknown) => ({ type: "overlay/open", payload }) }));

import "./edit";
import "./export";
import "./fullscreen-editor";

const source = {
  type: "note" as const, mode: "editable" as const, noteId: "note-1", sourceId: "source", snapshotId: "snapshot",
  editBase: { noteId: "note-1", organizationId: "org-1", version: 0, actorId: "actor" },
  acknowledgedPhysicalSnapshot: { id: "note-1", organization_id: "org-1", version: 0, content: "base", label: "N", folder_name: null, folder_id: null, tags: [], metadata: {}, visibility: "personal" as const, position: 0, project_id: null, task_id: null },
  displayedPhysicalSnapshot: { id: "note-1", organization_id: "org-1", version: 0, content: "full body", label: "N", folder_name: null, folder_id: null, tags: [], metadata: {}, visibility: "personal" as const, position: 0, project_id: null, task_id: null },
};

describe("registered prepared Notes actions", () => {
  it.each(["edit", "html-preview", "open-fullscreen-editor"])("prepares full body before opening %s and saves through its callback bridge", async (id) => {
    const dispatch = jest.fn();
    const save = jest.fn(async (_content: string) => ({ note: { ...source.displayedPhysicalSnapshot, content: "saved", version: 1, created_at: "x", created_by: "actor", updated_at: "x", updated_by: "actor", deleted_at: null, content_hash: null, file_path: null, last_device_id: null, sync_version: 0 }, databaseWrite: "saved" as const, succeededFields: [], failedFields: [], safeCauses: {} }));
    const prepareEdit = jest.fn(async () => ({ source, content: source.displayedPhysicalSnapshot.content }));
    const ctx = {
      source, content: "selection only", dispatch, isAuthenticated: true,
      sourceAdapter: { instanceKeyPrefix: () => "note", prepareEdit, edit: async ({ newContent }: { newContent: string }) => save(newContent) },
      instanceKey: (suffix: string) => `note:${suffix}`,
      metadata: {}, extensions: { type: "note", isOwner: true },
    } as unknown as RichDocumentActionContext;
    await getAction(id)?.run(ctx);
    expect(prepareEdit).toHaveBeenCalled();
    const payload = dispatch.mock.calls.at(-1)?.[0].payload;
    expect(payload.data.content).toBe("full body");
    await emitFullScreenEditorSave(payload.data.callbackGroupId, "saved");
    expect(save).toHaveBeenCalledWith("saved");
  });
});
