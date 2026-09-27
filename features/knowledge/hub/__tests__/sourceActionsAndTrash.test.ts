/**
 * H6a: the hub's Source doors — Trash restore / purge (same RPCs the retired
 * Trash sheet used), bulk Process now / trash, and the agent write handlers
 * re-registered on the hub surface.
 */
const keepSource = jest.fn();
const processSourceNow = jest.fn();
const rpc = jest.fn();
const writeOne = jest.fn();
jest.mock("@/features/sources/api/sourcesApi", () => ({
  keepSource: (...a: unknown[]) => keepSource(...a),
  sourceRefusalSentence: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));
jest.mock("@/features/sources/api/processNow", () => ({ processSourceNow: (...a: unknown[]) => processSourceNow(...a) }));
jest.mock("@/utils/supabase/client", () => ({ supabase: { schema: () => ({ from: () => ({ update: () => ({ eq: () => ({ is: () => ({ select: () => "q" }) }) }) }) }) } }));
jest.mock("@/utils/supabase/ragDb", () => ({ ragDb: () => ({ rpc: (...a: unknown[]) => rpc(...a) }) }));
jest.mock("@/utils/supabase/writeOne", () => ({ writeOne: (...a: unknown[]) => writeOne(...a) }));

import { processSourceRow, runSourceBulk, trashSource, type ActionableSource } from "@/features/sources/sourceActions";
import { purgeTrashGroup, restoreTrashRow, type TrashDoors } from "@/features/rag/components/library/libraryTrash";
import { groupTrashRows, type TrashRow } from "@/features/rag/components/library/trashGroups";
import { buildHubWriteHandlers } from "@/features/knowledge/hub/hubAgentSurface";

const row = (p: Partial<ActionableSource> = {}): ActionableSource => ({
  id: "d1",
  name: "Doc",
  source_kind: "web_page",
  derivation_kind: "initial_extract",
  organization_id: "o1",
  ...p,
});

const trashRow = (p: Partial<TrashRow>): TrashRow => ({
  id: "t1",
  name: "Trashed",
  source_kind: "web_page",
  source_id: "s1",
  derivation_kind: "initial_extract",
  total_pages: null,
  deleted_at: "2026-09-27T00:00:00Z",
  deleted_via: null,
  file_name: null,
  hidden_chunks: 3,
  ...p,
});

beforeEach(() => jest.clearAllMocks());

describe("Trash restore / purge", () => {
  const doors = (fail?: string): TrashDoors & { calls: unknown[][]; files: string[] } => {
    const calls: unknown[][] = [];
    const files: string[] = [];
    return {
      calls,
      files,
      rpc: async (fn, args) => {
        calls.push([fn, args]);
        return { data: null, error: fail && fn === fail ? { message: "denied" } : null };
      },
      restoreFile: async (id) => {
        files.push(id);
      },
    };
  };

  it("restores one Source through fn_restore_library_document", async () => {
    const d = doors();
    expect(await restoreTrashRow(trashRow({}), d)).toBe('Restored "Trashed".');
    expect(d.calls).toEqual([["fn_restore_library_document", { p_id: "t1" }]]);
  });
  it("a file family restores through its file", async () => {
    const d = doors();
    await restoreTrashRow(trashRow({ deleted_via: "file_cascade", source_id: "file-9", file_name: "a.pdf" }), d);
    expect(d.files).toEqual(["file-9"]);
    expect(d.calls).toEqual([]);
  });
  it("a refused restore says so", async () => {
    await expect(restoreTrashRow(trashRow({}), doors("fn_restore_library_document"))).rejects.toThrow(/couldn't restore/);
  });
  it("purges every version, edits before recaptures before the first capture", async () => {
    const rows = [
      trashRow({ id: "cap", derivation_kind: "initial_extract" }),
      trashRow({ id: "edit", derivation_kind: "manual_curation" }),
      trashRow({ id: "re", derivation_kind: "recapture" }),
    ];
    const [group] = groupTrashRows(rows);
    const d = doors();
    await purgeTrashGroup(group, rows, d);
    expect(d.calls.map((c) => (c[1] as { p_id: string }).p_id)).toEqual(["edit", "re", "cap"]);
    expect(d.calls.every((c) => c[0] === "fn_purge_library_document")).toBe(true);
  });
  it("never purges a file family per document", async () => {
    const rows = [trashRow({ deleted_via: "file_cascade" })];
    await expect(purgeTrashGroup(groupTrashRows(rows)[0], rows, doors())).rejects.toThrow(/together with the file/);
  });
});

describe("bulk Process now and trash", () => {
  it("a queued keep is enough; a deferred one runs Process now on the current version", async () => {
    keepSource.mockResolvedValueOnce({ intelligence: "queued" });
    expect(await processSourceRow(row())).toBe("Processing has started.");
    expect(processSourceNow).not.toHaveBeenCalled();

    keepSource.mockResolvedValueOnce({ intelligence: "deferred" });
    processSourceNow.mockResolvedValueOnce({ ok: true, message: "Processing now." });
    await processSourceRow(row(), "edit-7");
    expect(processSourceNow).toHaveBeenCalledWith("edit-7", { isFileExtract: false });
  });
  it("counts and names the first refusal", async () => {
    const out = await runSourceBulk("Processing", [row({ name: "A" }), row({ name: "B" })], async (r) => {
      if (r.name === "B") throw new Error("B is not yours.");
      return null;
    });
    expect(out.ok).toBe(false);
    expect(out.sentence).toBe("Processing 1 of 2. B is not yours.");
  });
  it("a file's own extract goes to the trash with its file", async () => {
    rpc.mockResolvedValueOnce({ error: null });
    await trashSource(row({ source_kind: "cld_file", derivation_kind: "initial_extract" }));
    expect(rpc).toHaveBeenCalledWith("fn_delete_library_document_and_source", { p_id: "d1" });
    expect(writeOne).not.toHaveBeenCalled();
    await trashSource(row());
    expect(writeOne).toHaveBeenCalledTimes(1);
  });
});

describe("agent write handlers on the hub surface", () => {
  const cb = () => ({
    setSearch: jest.fn(),
    showAllSources: jest.fn(),
    listedSourceIds: () => new Set(["d1"]),
    openSource: jest.fn(),
  });
  it("library_filters sets the words and shows every Source", () => {
    const c = cb();
    buildHubWriteHandlers(c).library_filters({ search_query: "invoice", status_filter: "all" });
    expect(c.setSearch).toHaveBeenCalledWith("invoice");
    expect(c.showAllSources).toHaveBeenCalled();
  });
  it("refuses unknown keys and statuses with nothing changed", () => {
    const c = cb();
    const h = buildHubWriteHandlers(c);
    expect(() => h.library_filters({ bogus: 1 })).toThrow(/unknown key/);
    expect(() => h.library_filters({ status_filter: "failed" })).toThrow(/Stage/);
    expect(c.setSearch).not.toHaveBeenCalled();
  });
  it("selected_document_id opens a listed Source in the peek, refuses others", () => {
    const c = cb();
    const h = buildHubWriteHandlers(c);
    h.selected_document_id("d1");
    expect(c.openSource).toHaveBeenCalledWith("d1");
    expect(() => h.selected_document_id("zzz")).toThrow(/not a Source listed/);
  });
});
