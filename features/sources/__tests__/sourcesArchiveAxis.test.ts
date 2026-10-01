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
