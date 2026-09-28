import type { EducationLibraryRow } from "@/features/education/library/types";
import { recoverManualKitDraft } from "./manualKitDraftRecovery";

const row: EducationLibraryRow = {
  access_level: "organization", accuracy_pct: 0, created_at: "2026-09-28T00:00:00Z", created_by: "user-1",
  description: "", difficulty: "", due_count: 0, duration_seconds: 0, id: "aid-1", is_owner: true,
  item_count: 0, kind: "fc_set", last_studied_at: "", organization_id: "org-1", organization_name: "Org",
  owner_email: "owner@example.com", source_title: "", status: "active", studied_count: 0, subtype: "flashcards",
  title: "Fresh flashcards", topic: "", total_count: 1, updated_at: "2026-09-28T00:00:00Z", visibility: "private",
};

describe("recoverManualKitDraft", () => {
  it("restores only current source metadata and owned rows for qualified valid refs", async () => {
    const resolveSource = jest.fn().mockResolvedValue({ name: "Current source.pdf" });
    const resolveRows = jest.fn().mockResolvedValue([row]);
    await expect(recoverManualKitDraft(JSON.stringify({
      title: "Cells",
      sourceId: "file-1",
      sourceName: "stale.pdf",
      selected: [{ kind: "fc_set", id: "aid-1", title: "stale title" }, { kind: "unknown", id: "bad" }, { kind: "fc_set", id: "aid-1" }],
    }), { resolveSource, resolveRows })).resolves.toEqual({
      title: "Cells", source: { id: "file-1", name: "Current source.pdf" }, selected: [row], restored: true,
    });
    expect(resolveRows).toHaveBeenCalledWith([{ kind: "fc_set", id: "aid-1" }]);
  });

  it("finishes recovery with no stale selection when source or library authorization fails", async () => {
    await expect(recoverManualKitDraft(JSON.stringify({ title: "Cells", sourceId: "file-1", selected: [{ kind: "note", id: "aid-1" }] }), {
      resolveSource: jest.fn().mockRejectedValue(new Error("forbidden")),
      resolveRows: jest.fn().mockRejectedValue(new Error("forbidden")),
    })).resolves.toEqual({ title: "Cells", source: null, selected: [], restored: true });
  });

  it("uses the route's source identity instead of a draft from another kit", async () => {
    const resolveSource = jest.fn().mockResolvedValue({ name: "Route source.pdf" });
    await expect(recoverManualKitDraft(JSON.stringify({ sourceId: "stale-file", selected: [] }), {
      resolveSource,
      resolveRows: jest.fn(),
    }, { sourceIdOverride: "route-file" })).resolves.toMatchObject({ source: { id: "route-file", name: "Route source.pdf" } });
    expect(resolveSource).toHaveBeenCalledWith("route-file");
  });

  it("rejects malformed storage without calling an authorized read", async () => {
    const resolveSource = jest.fn();
    const resolveRows = jest.fn();
    await expect(recoverManualKitDraft("{", { resolveSource, resolveRows })).resolves.toBeNull();
    expect(resolveSource).not.toHaveBeenCalled();
    expect(resolveRows).not.toHaveBeenCalled();
  });
});
