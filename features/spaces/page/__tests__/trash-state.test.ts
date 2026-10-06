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

/**
 * Round 18 regression: a page moved to Trash while open kept saving — "Saving…", "Not saved — retrying",
 * "You cannot edit this Space" on a loop. In Trash nothing is written and the room elects no host.
 */
import { mayWrite, roomCanEdit } from "../trash-state";

describe("a page in Trash writes nothing", () => {
  const live = { trashed: false, host: true, pending: true, inFlight: false };
  it("the host writes pending changes of a live page", () => {
    expect(mayWrite(live)).toBe(true);
  });
  it("never while the page is in Trash, even as host with changes pending", () => {
    expect(mayWrite({ ...live, trashed: true })).toBe(false);
  });
  it("in Trash the member is no editor for the room (so it is never elected host); Restore gives it back", () => {
    expect(roomCanEdit(true, true)).toBe(false);
    expect(roomCanEdit(true, false)).toBe(true);
    expect(roomCanEdit(false, false)).toBe(false);
  });
});
