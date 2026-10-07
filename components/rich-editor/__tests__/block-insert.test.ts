/**
 * The rich editor's "insert a block after / before the selection" never
 * splits a word (G5 review, 2026-10-02: "of" → "o" + reference + "f").
 * SUT: insertMarkdownBlock on a real headless Tiptap editor, serialized back
 * to the stored text.
 */
import { Editor, getSchema, type JSONContent } from "@tiptap/core";
import { AllSelection, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { createRichEditorExtensions } from "@ai-matrx/rich-editor/core/extensions";
import {
  buildVisualDocument,
  captureBaseline,
  serializeVisualDocument,
} from "@ai-matrx/rich-editor/core/visual-document";
import { insertMarkdownBlock } from "@ai-matrx/rich-editor/core/block-insert";
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

/**
 * G8B review (2026-10-02): a right-click with no click in the text first left
 * the selection OUTSIDE a textblock (a selected chip, ⌘A, a top-level gap) and
 * `insertMarkdownBlock` threw "Inserted content deeper than insertion
 * position" — the picker stayed open and nothing was inserted. Every position
 * × every selection kind must insert the block whole, on its own lines, with
 * every word of the note intact.
 */
describe("a block inserted from ANY selection", () => {
  const RICH =
    "# Title\n\nTell me of it.\n\n- one\n- two\n\n> quoted\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```matrx\n{\"a\":1}\n```\n";
  const FENCE = '```matrx\n{"x":1}\n```';
  const WORDS = ["Title", "Tell me of it.", "one", "two", "quoted", "| 1 | 2 |", '{"a":1}'];

  type Kind = "text" | "node" | "all";
  function select(doc: Editor["state"]["doc"], kind: Kind, pos: number) {
    try {
      if (kind === "all") return pos === 0 ? new AllSelection(doc) : null;
      if (kind === "node") return NodeSelection.create(doc, pos);
      const $pos = doc.resolve(pos);
      // A stale or programmatic TextSelection can point anywhere — build it raw.
      return new TextSelection($pos, $pos);
    } catch {
      return null;
    }
  }

  it("never throws and always lands the block whole", () => {
    const { json, plan } = buildVisualDocument(RICH, schema);
    const probe = new Editor({ element: document.createElement("div"), extensions, content: json as JSONContent });
    const size = probe.state.doc.content.size;
    probe.destroy();
    const failures: string[] = [];
    let cases = 0;
    for (let pos = 0; pos <= size; pos++) {
      for (const kind of ["text", "node", "all"] as Kind[]) {
        for (const where of ["after", "before"] as const) {
          const editor = new Editor({ element: document.createElement("div"), extensions, content: json as JSONContent });
          const baseline = captureBaseline(editor.state.doc, plan);
          const sel = select(editor.state.doc, kind, pos);
          if (!sel) {
            editor.destroy();
            continue;
          }
          cases += 1;
          try {
            editor.commands.command(({ tr }) => {
              tr.setSelection(sel);
              insertMarkdownBlock(tr, editor.state.schema, FENCE, where);
              return true;
            });
            const out = serializeVisualDocument(editor.state.doc, baseline);
            const lines = out.split("\n");
            const fenceOnOwnLines = lines.includes("```matrx") && lines.includes('{"x":1}');
            const intact = WORDS.every((w) => out.includes(w));
            if (!fenceOnOwnLines || !intact || out.split('{"x":1}').length !== 2) {
              failures.push(`${kind}@${pos} ${where}: wrong output\n${out}`);
            }
          } catch (error) {
            failures.push(`${kind}@${pos} ${where}: ${(error as Error).message}`);
          }
          editor.destroy();
        }
      }
    }
    expect(cases).toBeGreaterThan(100);
    expect(failures).toEqual([]);
  });
});
