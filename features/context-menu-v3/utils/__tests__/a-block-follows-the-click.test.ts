/**
 * A block lands on the side of the click (G11B review, 2026-10-07: every
 * reference and button became its own block AFTER the paragraph, even from a
 * right-click at the start of a line). From the start or the first half of the
 * caret's line → BEFORE it; anywhere else → AFTER it. Every caret position is
 * swept, in a textarea and in a contentEditable editor.
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
    const side = offset * 2 < LINE.length ? "before" : "after";
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
    [3, "before"],
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
