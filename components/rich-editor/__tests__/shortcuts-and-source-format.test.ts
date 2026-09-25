/**
 * The keyboard table binds everything it lists, and the source view's
 * formatting verbs move only the selected bytes.
 *
 * Breaks named: a shortcut listed in the ⌘/ sheet with no handler (a dead key);
 * a source-view bold that re-writes the line or leaves stray markers; a
 * heading/list prefix that stacks instead of replacing.
 */
import { RICH_EDITOR_SHORTCUTS, TYPED_TRIGGERS } from "../core/shortcuts";
import { SHORTCUT_HANDLERS } from "../visual/shortcut-handlers";
import { applySourceEdit, makeLink, setLinePrefix, toggleWrap } from "../core/source-format";

describe("the shortcut table", () => {
  it.each(RICH_EDITOR_SHORTCUTS.filter((spec) => spec.keys.some((key) => !TYPED_TRIGGERS.has(key))))(
    "%# $label ($keys) has a visual handler",
    (spec) => {
      expect(typeof SHORTCUT_HANDLERS[spec.id]).toBe("function");
    },
  );

  it("no key is bound to two different actions", () => {
    const seen = new Map<string, string>();
    for (const spec of RICH_EDITOR_SHORTCUTS) {
      for (const key of spec.keys) {
        expect(seen.get(key) ?? spec.id).toBe(spec.id);
        seen.set(key, spec.id);
      }
    }
  });
});

describe("source-view formatting", () => {
  const LINE = "Pick up totes at Alton today";

  it("bold wraps exactly the selection", () => {
    const from = LINE.indexOf("totes");
    expect(applySourceEdit(LINE, toggleWrap(LINE, from, from + 5, "**"))).toBe("Pick up **totes** at Alton today");
  });

  it("bold on an already-bold selection unwraps it", () => {
    const bold = "Pick up **totes** at Alton today";
    const from = bold.indexOf("totes");
    expect(applySourceEdit(bold, toggleWrap(bold, from, from + 5, "**"))).toBe(LINE);
  });

  it("a heading prefix replaces a list prefix instead of stacking", () => {
    const text = "- Alton stops\n- Barranca stops";
    expect(applySourceEdit(text, setLinePrefix(text, 0, text.length, "## "))).toBe("## Alton stops\n## Barranca stops");
  });

  it("a numbered prefix counts up across the selected lines", () => {
    const text = "Weigh in\nPhotograph manifests\nUnload";
    expect(applySourceEdit(text, setLinePrefix(text, 0, text.length, "1. "))).toBe("1. Weigh in\n2. Photograph manifests\n3. Unload");
  });

  it("clearing a prefix keeps the words", () => {
    const text = "> [!NOTE] stays\n# Title";
    expect(applySourceEdit(text, setLinePrefix(text, text.indexOf("# Title"), text.length, null))).toBe("> [!NOTE] stays\nTitle");
  });

  it("a link wraps the selection with the address", () => {
    const from = LINE.indexOf("Alton");
    expect(applySourceEdit(LINE, makeLink(LINE, from, from + 5, "https://maps.test/alton"))).toBe(
      "Pick up totes at [Alton](https://maps.test/alton) today",
    );
  });
});
