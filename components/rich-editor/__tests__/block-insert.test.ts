/**
 * The rich editor's "insert a block after / before the selection" never
 * splits a word (G5 review, 2026-10-02: "of" → "o" + reference + "f").
 * SUT: insertMarkdownBlock on a real headless Tiptap editor, serialized back
 * to the stored text.
 */
import { Editor, getSchema, type JSONContent } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { createRichEditorExtensions } from "../core/extensions";
import {
  buildVisualDocument,
  captureBaseline,
  serializeVisualDocument,
} from "../core/visual-document";
import { insertMarkdownBlock } from "../core/block-insert";
import { blockBoundary } from "@/utils/text-insertion";

const extensions = createRichEditorExtensions();
const schema = getSchema(extensions);
const SOURCE = "Tell me of it.\n\nNext paragraph.\n";
const BLOCK = "> A quoted block";

function positionInside(editor: Editor, needle: string, offset: number): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found !== -1) return false;
    if (node.isText && node.text?.includes(needle)) {
      found = pos + node.text.indexOf(needle) + offset;
      return false;
    }
    return true;
  });
  return found;
}

function run(where: "before" | "after"): string {
  const { json, plan } = buildVisualDocument(SOURCE, schema);
  const editor = new Editor({ element: document.createElement("div"), extensions, content: json as JSONContent });
  const baseline = captureBaseline(editor.state.doc, plan);
  const at = positionInside(editor, "of", 1); // between "o" and "f"
  editor.commands.command(({ tr }) => {
    tr.setSelection(TextSelection.create(tr.doc, at));
    insertMarkdownBlock(tr, editor.state.schema, BLOCK, where);
    return true;
  });
  const out = serializeVisualDocument(editor.state.doc, baseline);
  editor.destroy();
  return out;
}

describe("a block inserted in the visual editor", () => {
  it("after: lands after the caret's paragraph, 'of' stays whole", () => {
    const out = run("after");
    expect(out).toContain("Tell me of it.");
    expect(out.indexOf("Tell me of it.")).toBeLessThan(out.indexOf("A quoted block"));
    expect(out.indexOf("A quoted block")).toBeLessThan(out.indexOf("Next paragraph."));
  });

  it("before: lands before the caret's paragraph, 'of' stays whole", () => {
    const out = run("before");
    expect(out).toContain("Tell me of it.");
    expect(out.indexOf("A quoted block")).toBeLessThan(out.indexOf("Tell me of it."));
  });

  it("the source view uses the same line edge", () => {
    const caret = SOURCE.indexOf("of") + 1;
    expect(blockBoundary(SOURCE, caret, caret, "after")).toBe(SOURCE.indexOf("\n"));
  });
});
