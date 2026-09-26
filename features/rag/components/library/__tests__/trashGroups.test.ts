/**
 * Final verification (2026-09-26): the trash listed each VERSION of a Source
 * as its own item — same name four times, "1 segments". One item per Source
 * (its versions share `source_id`), with its version count; counts read in
 * words ("1 segment").
 */
import { groupTrashRows, piecesWords } from "@/features/rag/components/library/trashGroups";

const row = (id: string, source_id: string, derivation_kind: string, deleted_at: string, over = {}) => ({
  id, name: "verifier 067/versions", source_kind: "inline", source_id, derivation_kind,
  total_pages: 1, deleted_at, deleted_via: null, file_name: null, hidden_chunks: 1, ...over,
});

describe("groupTrashRows", () => {
  it("one item per Source, with its version count and every id", () => {
    const groups = groupTrashRows([
      row("a", "s1", "initial_extract", "2026-09-26T10:00:00Z"),
      row("b", "s1", "recapture", "2026-09-26T10:00:00Z"),
      row("c", "s1", "manual_curation", "2026-09-26T10:00:00Z"),
      row("d", "s2", "initial_extract", "2026-09-26T09:00:00Z"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].versions).toBe(3);
    expect(groups[0].ids.sort()).toEqual(["a", "b", "c"]);
    // The head (newest capture, never an edit) is the item restored.
    expect(groups[0].head.id).toBe("b");
    expect(groups[0].hiddenChunks).toBe(3);
  });

  it("a file's family stays apart from a same-id inline chain", () => {
    const groups = groupTrashRows([
      row("f1", "file-1", "initial_extract", "2026-09-26T10:00:00Z", { deleted_via: "file_cascade" }),
      row("x", "file-1", "initial_extract", "2026-09-26T10:00:00Z"),
    ]);
    expect(groups).toHaveLength(2);
  });
});

describe("piecesWords", () => {
  it("says 1 segment, 2 segments", () => {
    expect(piecesWords(1)).toBe("1 segment");
    expect(piecesWords(2)).toBe("2 segments");
  });
});
