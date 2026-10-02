/**
 * "Insert reference…" never splits the word under the caret.
 *
 * THE DEFECT (G5 review, 2026-10-02, nightly clone): with the caret inside
 * "of", the reference landed between its letters — "o" + block + "f". A block
 * belongs on its own line: the end of the caret's line, in every target the
 * menu writes to (textarea, contentEditable, a rich editor's caret API).
 */

import { insertIntoEditor, ownParagraph } from "../insert-into-editor";
import { blockBoundary } from "@/utils/text-insertion";

const FENCE = '```matrx\n{"__kind":"reference:note","items":[{"id":"n1"}]}\n```';
const TEXT = "Tell me of it\nNext line";
const INSIDE_OF = TEXT.indexOf("of") + 1; // between "o" and "f"

function block() {
  return {
    editor: `\n${FENCE}\n`,
    textarea: (field: HTMLTextAreaElement) => ownParagraph(FENCE, field),
    caret: FENCE,
    placement: "block" as const,
  };
}

describe("a block lands at a line edge, never inside a word", () => {
  it("blockBoundary: the end of the caret's line, or the start for before", () => {
    expect(blockBoundary(TEXT, INSIDE_OF, INSIDE_OF)).toBe(TEXT.indexOf("\n"));
    expect(blockBoundary(TEXT, INSIDE_OF, INSIDE_OF, "before")).toBe(0);
    expect(blockBoundary(TEXT, TEXT.length - 2, TEXT.length - 2)).toBe(TEXT.length);
    expect(blockBoundary(TEXT, TEXT.length - 2, TEXT.length - 2, "before")).toBe(
      TEXT.indexOf("\n") + 1,
    );
  });

  it("a textarea keeps 'of' whole", () => {
    const field = document.createElement("textarea");
    document.body.appendChild(field);
    field.value = TEXT;
    field.setSelectionRange(INSIDE_OF, INSIDE_OF);
    expect(insertIntoEditor({ getTextarea: () => field }, block())).toBe("textarea");
    expect(field.value).toContain("Tell me of it");
    expect(field.value).toBe(`Tell me of it\n\n${FENCE}\n\nNext line`);
    field.remove();
  });

  it("a contentEditable editor keeps 'of' whole", () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.setAttribute("data-editor-id", "g5-editor");
    editor.textContent = TEXT;
    document.body.appendChild(editor);
    const range = document.createRange();
    range.setStart(editor.firstChild!, INSIDE_OF);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    expect(insertIntoEditor({ editorId: "g5-editor" }, block())).toBe("editor");
    expect(editor.textContent).toContain("Tell me of it");
    expect(editor.textContent).not.toContain("o\n");
    editor.remove();
  });

  it("a rich editor's caret API is told it is a block", () => {
    const insertAtCaret = jest.fn(() => true);
    expect(insertIntoEditor({ insertAtCaret }, block())).toBe("caret");
    expect(insertAtCaret).toHaveBeenCalledWith(FENCE, "block");
  });
});
