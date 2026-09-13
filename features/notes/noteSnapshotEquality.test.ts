import { canonicalNoteSnapshotValue, equalNoteSnapshotValue } from "./noteSnapshotEquality";

describe("Notes snapshot JSON identity", () => {
  it("ignores object key order, preserves array order, and permits shared JSON values", () => {
    const shared = { content: "draft" };
    expect(equalNoteSnapshotValue({ b: shared, a: shared }, { a: { content: "draft" }, b: { content: "draft" } })).toBe(true);
    expect(equalNoteSnapshotValue(["a", "b"], ["b", "a"])).toBe(false);
    expect(equalNoteSnapshotValue({}, { content: null })).toBe(false);
  });

  it("rejects accessors without invoking them", () => {
    const getter = jest.fn(() => "draft");
    const value = Object.defineProperty({}, "content", { enumerable: true, get: getter });
    expect(() => canonicalNoteSnapshotValue(value)).toThrow(/data properties/);
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects non-JSON identities rather than silently dropping information", () => {
    const cyclic: { child?: unknown } = {};
    cyclic.child = cyclic;
    const values = [cyclic, new Date(), [,"draft"], { content: undefined }, { value: Infinity }, { [Symbol("hidden")]: "draft" }, Object.defineProperty({}, "hidden", { value: "draft" })];
    for (const value of values) expect(() => canonicalNoteSnapshotValue(value)).toThrow();
  });
});
