/**
 * V5-B (2026-09-30): an independent verifier could not archive its own test Sources. A Source is
 * archived through the platform's one archive (`deleted_at`, `trashSource`) and the Sources page
 * carries THE ARCHIVED-ITEMS LAW's filter: Active only hides archived Sources, Archived only lists
 * them (with Restore), Active + archived lists both. Before this, every read hard-coded
 * `deleted_at is null`, so an archived Source could only be found in Trash.
 */
import { applySourcesArchiveAxis } from "../hooks/useSources";
import { isSourceArchived } from "../sourceRows";

function recorder() {
  const calls: string[] = [];
  const q = {
    is(column: string, value: null) {
      calls.push(`is:${column}=${String(value)}`);
      return q;
    },
    or(filter: string) {
      calls.push(`or:${filter}`);
      return q;
    },
  };
  return { q, calls };
}

describe("the Sources archive axis", () => {
  it("Active only (the default) hides archived Sources", () => {
    const { q, calls } = recorder();
    applySourcesArchiveAxis(q);
    expect(calls).toEqual(["is:deleted_at=null", "is:archived_at=null"]);
  });

  it("Archived only lists Sources moved out through the one archive or marked archived", () => {
    const { q, calls } = recorder();
    applySourcesArchiveAxis(q, "archived");
    expect(calls).toEqual(["or:deleted_at.not.is.null,archived_at.not.is.null"]);
  });

  it("Active + archived narrows nothing", () => {
    const { q, calls } = recorder();
    applySourcesArchiveAxis(q, "all");
    expect(calls).toEqual([]);
  });

  it("an archived row offers Restore, a live one Archive", () => {
    expect(isSourceArchived({ deleted_at: "2026-09-30T10:00:00Z", archived_at: null })).toBe(true);
    expect(isSourceArchived({ deleted_at: null, archived_at: "2026-09-30T10:00:00Z" })).toBe(true);
    expect(isSourceArchived({ deleted_at: null, archived_at: null })).toBe(false);
  });
});

/**
 * V6-B (2026-10-01): archived Sources read "Not yet searchable" (they were "Searchable · key terms
 * found"): archiving takes a Source's index out of search with it, so its facts read zero chunks.
 * The archive is the state the cell shows; the stage comes back on restore.
 */
import { stageCellLabel, stageCellState, type SourceFacts } from "../sourceRows";

describe("an archived Source's Stage cell", () => {
  const archivedFacts: SourceFacts = {
    chunkCount: 0, hasEntities: false, attachments: [], currentDocumentId: "d", currentChunkCount: 0,
    currentHasEntities: false, staleChunkCount: 0, indexing: false, headDocumentId: "d", entitiesState: "done",
  };
  const read = { loading: false, failed: false, retrying: false };

  it("says Archived, never a search stage", () => {
    expect(stageCellLabel(stageCellState(archivedFacts, read, true))).toBe("Archived");
    expect(stageCellLabel(stageCellState(undefined, { ...read, loading: true }, true))).toBe("Archived");
  });

  it("a live Source still shows its stage", () => {
    expect(stageCellLabel(stageCellState(archivedFacts, read, false))).toBe("Not yet searchable");
  });
});
