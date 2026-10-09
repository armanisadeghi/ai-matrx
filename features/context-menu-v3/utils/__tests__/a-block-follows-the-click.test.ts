/**
 * A block goes ABOVE the caret's line only from its very start (offset 0);
 * anywhere else → AFTER it (G11B review: a right-click at the start of a line
 * must put it above; G15 review, 2026-10-07: the old "first half → before"
 * rule put a block above a wrapped paragraph from a click 89% along its first
 * visual line). Every caret position is swept, in a textarea and in a
 * contentEditable editor. The rule is `blockBoundary(…, "nearest")`
 * (@ai-matrx/rich-editor ≥ 0.3.1).
 */

import { insertIntoEditor, ownParagraph } from "../insert-into-editor";

const FENCE = '```matrx\n{"__kind":"reference:note","items":[{"id":"n1"}]}\n```';
const LINE = "Tell me of it";
const TEXT = `Intro\n\n${LINE}\n\nNext line`;
const START = TEXT.indexOf(LINE);

function block() {
  return {
    editor: `\n${FENCE}\n`,
    textarea: (field: HTMLTextAreaElement) => ownParagraph(FENCE, field),
    caret: FENCE,
    placement: "block" as const,
  };
}

describe("a textarea puts the block on the side of the click", () => {
  for (let offset = 0; offset <= LINE.length; offset += 1) {
    const side = offset === 0 ? "before" : "after";
    it(`caret at ${offset}/${LINE.length} → ${side}`, () => {
      const field = document.createElement("textarea");
      document.body.appendChild(field);
      field.value = TEXT;
      field.setSelectionRange(START + offset, START + offset);
      expect(insertIntoEditor({ getTextarea: () => field }, block())).toBe("textarea");
      expect(field.value).toBe(
        side === "before"
          ? `Intro\n\n${FENCE}\n\n${LINE}\n\nNext line`
          : `Intro\n\n${LINE}\n\n${FENCE}\n\nNext line`,
      );
      field.remove();
    });
  }
});

describe("a contentEditable editor puts the block on the side of the click", () => {
  for (const [offset, side] of [
    [0, "before"],
    [3, "after"],
    [10, "after"],
    [LINE.length, "after"],
  ] as const) {
    it(`caret at ${offset} → ${side}`, () => {
      const editor = document.createElement("div");
      editor.contentEditable = "true";
      editor.setAttribute("data-editor-id", "g11b-editor");
      editor.textContent = TEXT;
      document.body.appendChild(editor);
      const range = document.createRange();
      range.setStart(editor.firstChild!, START + offset);
      range.collapse(true);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      expect(insertIntoEditor({ editorId: "g11b-editor" }, block())).toBe("editor");
      const text = editor.textContent ?? "";
      expect(text).toContain(LINE);
      if (side === "before") expect(text.indexOf(FENCE)).toBeLessThan(text.indexOf(LINE));
      else expect(text.indexOf(FENCE)).toBeGreaterThan(text.indexOf(LINE));
      editor.remove();
    });
  }
});

describe("a wrapped paragraph (G15)", () => {
  it("a click 89% along its first visual line puts the block AFTER it", () => {
    const long = "Wrapped words keep going across the page ".repeat(8).trim();
    const field = document.createElement("textarea");
    document.body.appendChild(field);
    field.value = `Intro\n\n${long}\n\nNext line`;
    const caret = field.value.indexOf(long) + Math.round(80 * 0.89);
    field.setSelectionRange(caret, caret);
    expect(insertIntoEditor({ getTextarea: () => field }, block())).toBe("textarea");
    expect(field.value).toBe(`Intro\n\n${long}\n\n${FENCE}\n\nNext line`);
    field.remove();
  });
});
