import { isArchivedRow, withArchivedRowsReadOnly } from "../archivedRow";

describe("archived rows are read-only in every list", () => {
  it("reads every lifecycle field a list uses", () => {
    expect(isArchivedRow({ archived: true })).toBe(true);
    expect(isArchivedRow({ is_archived: true })).toBe(true);
    expect(isArchivedRow({ deleted_at: "2026-10-02T00:00:00Z" })).toBe(true);
    expect(isArchivedRow({ archived_at: "2026-10-02T00:00:00Z" })).toBe(true);
    expect(isArchivedRow({ archived: false, deleted_at: null })).toBe(false);
  });
  it("an editable column refuses archived rows and keeps its own gate", () => {
    const col = withArchivedRowsReadOnly<{ editable: string; editableIf?: (r: { kind: string; archived?: boolean }) => boolean }, { kind: string; archived?: boolean }>({
      editable: "string",
      editableIf: (r) => r.kind !== "unsorted",
    });
    expect(col.editableIf!({ kind: "board" })).toBe(true);
    expect(col.editableIf!({ kind: "board", archived: true })).toBe(false);
    expect(col.editableIf!({ kind: "unsorted" })).toBe(false);
    const plain = { editable: undefined as string | undefined };
    expect(withArchivedRowsReadOnly(plain)).toBe(plain);
  });
});
