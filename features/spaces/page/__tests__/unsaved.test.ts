/**
 * Round 18 blocker: a save the database refused ("column" was expected) left the edits only in the open
 * editor — a reload brought back the last stored version and everything after it was gone.
 * A refused or failed save keeps the page on this device; a reload finds it; a stored save clears it.
 */
import type { SpaceDoc } from "../../contract";
import { attemptSave, forgetUnsaved, plainSaveError, readUnsaved, type KeepStorage } from "../unsaved";

function memoryStorage(): KeepStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

const settings = { font: "default", smallText: false, fullWidth: false, locked: false } as SpaceDoc["settings"];
const page = (blocks: SpaceDoc["blocks"], version = 4): SpaceDoc =>
  ({ id: "page-1", title: "Launch plan", icon: null, cover: null, settings, blocks, version, parentId: null, isArchived: false, updatedAt: "2026-10-06T10:00:00Z" }) as unknown as SpaceDoc;
const text = (id: string, t: string) => ({ id, type: "text", text: [{ text: t }] });

describe("a refused save never loses the person's edits", () => {
  it("the database refuses the snapshot: the page is kept on the device and found again after a reload", async () => {
    const storage = memoryStorage();
    const edited = page([text("a", "Kickoff notes"), text("b", "Typed after the refusal")]);
    const refusal = { code: "22023", message: 'not a valid snapshot: /blocks/0/children/0: "column" was expected' };
    const r = await attemptSave({ spaceId: "page-1", doc: edited, baseVersion: 4, storage, save: () => Promise.reject(refusal) });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.refused).toBe(true);
    expect(r.ok === false && r.message).toBe("Not saved: these columns can't be stored as they are. Your changes are kept here.");
    // A reload: nothing in memory, only the device.
    const kept = readUnsaved(storage, "page-1");
    expect(kept?.baseVersion).toBe(4);
    expect(kept?.doc.blocks).toEqual(edited.blocks);
    expect(kept?.doc.title).toBe("Launch plan");
  });

  it("a body the database would refuse is not sent at all, and is kept", async () => {
    const storage = memoryStorage();
    const save = jest.fn();
    const bad = page([{ id: "l", type: "columnList", children: [{ id: "c", type: "column", props: { width: 1 }, children: [text("x", "Only one column")] }] }]);
    const r = await attemptSave({ spaceId: "page-1", doc: bad, baseVersion: 4, storage, save });
    expect(save).not.toHaveBeenCalled();
    expect(r.ok === false && r.refused).toBe(true);
    expect(readUnsaved(storage, "page-1")?.doc.blocks).toEqual(bad.blocks);
  });

  it("a network failure keeps it too; a stored save clears it", async () => {
    const storage = memoryStorage();
    const doc = page([text("a", "Draft")]);
    await attemptSave({ spaceId: "page-1", doc, baseVersion: 4, storage, save: () => Promise.reject(new Error("Failed to fetch")) });
    expect(readUnsaved(storage, "page-1")).not.toBeNull();
    const r = await attemptSave({ spaceId: "page-1", doc, baseVersion: 4, storage, save: async (d) => ({ ...d, version: 5 }) });
    expect(r.ok).toBe(true);
    expect(readUnsaved(storage, "page-1")).toBeNull();
  });

  it("copies are per page and survive a broken entry", () => {
    const storage = memoryStorage();
    storage.setItem("spaces:unsaved:page-2", "{not json");
    expect(readUnsaved(storage, "page-2")).toBeNull();
    forgetUnsaved(storage, "page-2");
    expect(storage.map.size).toBe(0);
    expect(plainSaveError("Failed to fetch")).toBe("Not saved: Failed to fetch. Your changes are kept here.");
  });
});
