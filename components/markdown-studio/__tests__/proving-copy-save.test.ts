/**
 * A save to the proving copy never leaves a copy without the typed text
 * (verify-RC-B4 R6-4). The first save is two writes (copy the original, then the
 * edit); when the edit's write fails under a slow/restarting server, the copy
 * just made is archived and the person is told.
 */
jest.mock("@/components/rich-editor/RichEditor", () => ({ __esModule: true, default: () => null }));
jest.mock("@/features/notes/service/notesApi", () => ({ NotesAPI: {} }));
jest.mock("@/lib/organizations/personalOrg", () => ({ ensureOrgId: jest.fn() }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/lib/organizations/organizationRefusalToast", () => ({ presentOrganizationRefusal: () => false }));

import { saveToProvingCopy, type ProvingCopy } from "@/components/markdown-studio/StudioEditorMode";

const ORIGINAL = "Tonight's handover: drain the print queue.";
const TYPED = `${ORIGINAL} Swap the label printer.`;

function fakeNotes(failUpdate: boolean) {
  const rows = new Map<string, { content: string; version: number; archived: boolean }>();
  return {
    rows,
    io: {
      createCopy: async (): Promise<ProvingCopy> => {
        rows.set("copy-1", { content: ORIGINAL, version: 1, archived: false });
        return { id: "copy-1", label: "Proving copy — handover", version: 1, content: ORIGINAL };
      },
      update: async (id: string, content: string) => {
        if (failUpdate) throw new Error("the server restarted");
        const row = rows.get(id)!;
        rows.set(id, { ...row, content, version: row.version + 1 });
      },
      readBack: async (id: string) => ({ content: rows.get(id)!.content, version: rows.get(id)!.version }),
      archive: async (id: string) => {
        rows.set(id, { ...rows.get(id)!, archived: true });
      },
    },
  };
}

it("the first save writes the typed text into the new copy", async () => {
  const { rows, io } = fakeNotes(false);
  const result = await saveToProvingCopy(TYPED, null, io);
  expect(result.stored).toBe(TYPED);
  expect(rows.get("copy-1")).toEqual({ content: TYPED, version: 2, archived: false });
});

it("when the edit's write fails, no live copy without the typed text is left behind — and the person is told", async () => {
  const { rows, io } = fakeNotes(true);
  await expect(saveToProvingCopy(TYPED, null, io)).rejects.toThrow(
    /the server restarted.*archived, so no copy without your edit is left behind/,
  );
  const live = [...rows.values()].filter((row) => !row.archived);
  expect(live.every((row) => row.content === TYPED)).toBe(true);
});

it("a later save to an existing copy that fails leaves that copy alone (it already holds earlier edits)", async () => {
  const { rows, io } = fakeNotes(true);
  rows.set("copy-1", { content: TYPED, version: 2, archived: false });
  const existing = { id: "copy-1", label: "Proving copy — handover", version: 2, content: TYPED };
  await expect(saveToProvingCopy(`${TYPED} More.`, existing, io)).rejects.toThrow("the server restarted");
  expect(rows.get("copy-1")?.archived).toBe(false);
});
