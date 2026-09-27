import { MergeFieldHistory, historyKey } from "./merge-field-history";

describe("MergeFieldHistory", () => {
  it("coalesces a burst of typing into one undo step", () => {
    const h = new MergeFieldHistory("");
    h.record("H", 1, "typing", 1000);
    h.record("Hi", 2, "typing", 1100);
    h.record("Hi!", 3, "typing", 1200);
    expect(h.undo()?.text).toBe("");
    expect(h.canUndo()).toBe(false);
    expect(h.redo()?.text).toBe("Hi!");
  });

  it("keeps an inserted field, an auto-chip and a paste as their own steps", () => {
    const h = new MergeFieldHistory("Hi ");
    h.record("Hi {{a}}", 8, "hard", 1000);
    h.record("Hi {{a}}{{b}}", 13, "hard", 1001);
    h.record("Hi {{a}}{{b}} pasted", 20, "hard", 1002);
    expect(h.undo()?.text).toBe("Hi {{a}}{{b}}");
    expect(h.undo()?.text).toBe("Hi {{a}}");
    expect(h.redo()?.text).toBe("Hi {{a}}{{b}}");
  });

  it("starts a new step after a pause, a change of kind, or an undo", () => {
    const h = new MergeFieldHistory("");
    h.record("a", 1, "typing", 0);
    h.record("ab", 2, "typing", 5000);
    h.record("ab dictated", 11, "external", 5001);
    expect(h.undo()?.text).toBe("ab");
    h.record("abc", 3, "typing", 5002);
    expect(h.canRedo()).toBe(false);
    expect(h.undo()?.text).toBe("ab");
    expect(h.undo()?.text).toBe("a");
    expect(h.undo()?.text).toBe("");
  });

  it("ignores a record that changes nothing", () => {
    const h = new MergeFieldHistory("x");
    h.record("x", 1, "hard");
    expect(h.canUndo()).toBe(false);
  });
});

describe("historyKey", () => {
  const k = (key: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "shiftKey" | "altKey", boolean>>) =>
    historyKey({ key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods });
  it("reads undo and redo on both platforms", () => {
    expect(k("z", { metaKey: true })).toBe("undo");
    expect(k("Z", { metaKey: true, shiftKey: true })).toBe("redo");
    expect(k("z", { ctrlKey: true })).toBe("undo");
    expect(k("y", { ctrlKey: true })).toBe("redo");
    expect(k("z", {})).toBeNull();
    expect(k("a", { metaKey: true })).toBeNull();
  });
});
