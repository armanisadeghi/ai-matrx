/**
 * EVERY EDITOR THAT OFFERS "INSERT" ACTUALLY INSERTS.
 *
 * 2026-10-02, notes Write mode: right-click → Insert reference… answered
 * "Copied instead" 3/3. The Notes host passes `getTextarea` in every mode (it
 * returns null while the rich editor is up) plus `insertAtCaret`; the engine
 * only reached `insertAtCaret` when `getTextarea` was ABSENT, so a dead getter
 * vetoed the live editor. Which target is live is a call-time fact.
 *
 * Breaks each test names:
 * - the caret path gated on getTextarea's presence again → "a host that swaps
 *   editors…" red.
 * - an insert in the engine that bypasses the one function (a second
 *   precedence that can drift) → "the engine has one insert path" red.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hasEditorInsertTarget,
  insertIntoEditor,
  ownParagraph,
} from "../utils/insert-into-editor";

const FENCE = '```matrx\n{"__kind":"directive_v1_reference_note","items":[{"id":"n1"}]}\n```';

function textarea(value: string, caret: number): HTMLTextAreaElement {
  const el = document.createElement("textarea");
  document.body.appendChild(el);
  el.value = value;
  el.setSelectionRange(caret, caret);
  return el;
}

describe("every editor that offers Insert inserts", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("a host that swaps editors (textarea getter returns null, rich editor up) inserts at the rich caret", () => {
    const insertAtCaret = jest.fn(() => true);
    const targets = { getTextarea: () => null, insertAtCaret, onTextReplace: jest.fn() };
    expect(hasEditorInsertTarget(targets)).toBe(true);
    expect(insertIntoEditor(targets, { editor: FENCE, textarea: () => FENCE, caret: `\n\n${FENCE}\n\n` })).toBe("caret");
    expect(insertAtCaret).toHaveBeenCalledWith(`\n\n${FENCE}\n\n`);
  });

  it("the same host with its textarea mounted writes the textarea, not the caret", () => {
    const field = textarea("Hello", 5);
    const insertAtCaret = jest.fn(() => true);
    const onTextReplace = jest.fn();
    const result = insertIntoEditor(
      { getTextarea: () => field, insertAtCaret, onTextReplace },
      { editor: FENCE, textarea: (f) => ownParagraph(FENCE, f), caret: FENCE },
    );
    expect(result).toBe("textarea");
    expect(insertAtCaret).not.toHaveBeenCalled();
    expect(onTextReplace).toHaveBeenCalledWith(`Hello\n\n${FENCE}`);
  });

  it("a rich-editor-only host (no textarea getter) inserts at the caret", () => {
    const insertAtCaret = jest.fn(() => true);
    expect(insertIntoEditor({ insertAtCaret }, FENCE)).toBe("caret");
  });

  it("nothing live → null, so the caller copies instead of failing silently", () => {
    expect(insertIntoEditor({ getTextarea: () => null, insertAtCaret: () => false }, FENCE)).toBeNull();
    expect(insertIntoEditor({}, FENCE)).toBeNull();
    expect(hasEditorInsertTarget({})).toBe(false);
  });

  it("ownParagraph adds blank lines only where the neighbours lack them", () => {
    expect(ownParagraph("X", textarea("", 0))).toBe("X");
    expect(ownParagraph("X", textarea("a\n\nb", 3))).toBe("X\n\n");
    expect(ownParagraph("X", textarea("a\nb", 2))).toBe("\nX\n\n");
  });

  it("the engine has one insert path: every insert goes through insertIntoEditor", () => {
    const src = readFileSync(join(__dirname, "../hooks/useContextMenuActions.ts"), "utf8");
    // A direct call is a second precedence rule that can drift from the one above.
    expect(src).not.toMatch(/\binsertTextAtCursor\(/);
    expect(src).not.toMatch(/\binsertTextAtTextareaCursor\(/);
    expect(src).not.toMatch(/\binsertAtCaret\?\.\(/);
    expect(src).toMatch(/\binsertIntoEditor\(/);
  });
});
