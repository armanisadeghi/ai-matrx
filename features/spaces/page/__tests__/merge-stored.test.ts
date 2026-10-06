/**
 * A version written outside the live room (Move to from another page) is merged into the room, never
 * overwritten by the host's next save — and the room's own deletions are never undone by it.
 */
import { blockIds, planStoredMerge } from "../merge-stored";
import type { SpaceBlock } from "../../contract";

const t = (id: string, children?: SpaceBlock[]): SpaceBlock => ({ id, type: "text", text: [{ text: id }], ...(children ? { children } : {}) }) as SpaceBlock;

describe("planStoredMerge", () => {
  it("takes in blocks moved here from another page, at the end where the mover put them", () => {
    const base = blockIds([t("a"), t("b")]);
    const room = [t("a"), t("b"), t("typed")];
    const plan = planStoredMerge(base, room, [t("a"), t("b"), t("m1"), t("m2")]);
    expect(plan.remove).toEqual([]);
    expect(plan.insert.map((i) => [i.block.id, i.after])).toEqual([
      ["m1", "b"],
      ["m2", "m1"],
    ]);
  });

  it("removes blocks the outside writer took away, keeps what the room added", () => {
    const base = blockIds([t("a"), t("b")]);
    const plan = planStoredMerge(base, [t("a"), t("b"), t("new")], [t("a")]);
    expect(plan.remove).toEqual(["b"]);
    expect(plan.insert).toEqual([]);
  });

  it("never resurrects a block the room deleted, nor re-adds one the room already holds", () => {
    const base = blockIds([t("a"), t("b")]);
    const plan = planStoredMerge(base, [t("a")], [t("a"), t("b")]);
    expect(plan).toEqual({ remove: [], insert: [] });
  });

  it("finds nested ids (a block inside a toggle is not new)", () => {
    const base = blockIds([t("p", [t("c")])]);
    const plan = planStoredMerge(base, [t("p", [t("c")])], [t("p", [t("c")]), t("x")]);
    expect(plan.insert.map((i) => i.block.id)).toEqual(["x"]);
  });

  it("places an added block first when nothing stored precedes it", () => {
    const plan = planStoredMerge(blockIds([t("a")]), [t("a")], [t("x"), t("a")]);
    expect(plan.insert).toEqual([{ block: t("x"), after: null }]);
  });
});
