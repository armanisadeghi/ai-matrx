/**
 * Round 17 regression: a page trashed from the sidebar while open showed no "in Trash" banner.
 * The open page reads Trash from the list — its own row or any ancestor's.
 */
import { trashedByList } from "../trash-state";

const e = (id: string, parentId: string | null = null) => ({ id, parentId });

describe("trashedByList", () => {
  it("is in Trash when its own row was trashed", () => {
    expect(trashedByList("p", null, [e("p")], new Map())).toBe(true);
  });
  it("is in Trash when its parent or a further ancestor was trashed", () => {
    expect(trashedByList("c", "p", [e("p")], new Map())).toBe(true);
    expect(trashedByList("g", "c", [e("p")], new Map([["c", e("c", "p")]]))).toBe(true);
  });
  it("is not in Trash when nothing above it was trashed", () => {
    expect(trashedByList("c", "p", [e("x")], new Map([["p", e("p")]]))).toBe(false);
  });
  it("survives a parent loop in a stale list", () => {
    expect(trashedByList("a", "b", [], new Map([["b", e("b", "a")], ["a", e("a", "b")]]))).toBe(false);
  });
});
