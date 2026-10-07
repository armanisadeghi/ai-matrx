/**
 * A ```matrx FENCE IS ONE ATOM IN WRITE — and its bytes never move.
 *
 * 2026-10-02 (notes, Write mode): an inserted reference arrived as raw JSON
 * text (the visual view inserted host text as literal characters), and a
 * stored one showed as a code block with a "matrx" language picker instead of
 * the chip / card the preview draws.
 *
 * SUT: buildVisualDocument → a real headless Tiptap Editor →
 * serializeVisualDocument, plus the ONE host-insert path
 * (`replaceSelectionWithMarkdown`) and the island naming (`islandMeta`).
 * Every expected value is the fixture text — never something the SUT computed.
 *
 * Breaks each test names:
 *   - a stored fence re-derived instead of copied → "no edit" / "typing beside it" red
 *   - host inserts as literal characters again → "an inserted reference is an island" red
 *   - the fence named by its kind slug / shown as code → "named in plain words" red
 */
import { Editor, getSchema, type JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { createRichEditorExtensions } from "@ai-matrx/rich-editor/core/extensions";
import { buildVisualDocument, captureBaseline, serializeVisualDocument } from "@ai-matrx/rich-editor/core/visual-document";
import { replaceSelectionWithMarkdown } from "@ai-matrx/rich-editor/core/paste-markdown";
import { isMatrxFence, islandMeta } from "@ai-matrx/rich-editor/islands/island-meta";

const extensions = createRichEditorExtensions();
const schema = getSchema(extensions);

const REFERENCE =
  '```matrx\n{"__kind":"directive_v1_reference_note","items":[{"id":"3f2b9c1e-6a4d-4e8f-9b2a-1c5d7e9f0a11","title":"Dock schedule"}]}\n```';
const ACTION =
  '```matrx\n{"__kind":"directive_v1_create_task","items":[{"title":"Call the carrier"}]}\n```';
const STORED = `Receiving notes\n\nTrucks arrive at 6.\n\n${REFERENCE}\n\nBay 3 is closed.\n`;

const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
});

function open(text: string) {
  const { json, plan } = buildVisualDocument(text, schema);
  const editor = new Editor({ element: document.createElement("div"), extensions, content: json as JSONContent });
  editors.push(editor);
  const baseline = captureBaseline(editor.state.doc, plan);
  return { editor, save: () => serializeVisualDocument(editor.state.doc, baseline) };
}

function islands(doc: PMNode): Array<{ raw: string; islandType: string }> {
  const out: Array<{ raw: string; islandType: string }> = [];
  doc.descendants((node) => {
    if (node.type.name === "islandBlock") out.push({ raw: String(node.attrs.raw), islandType: String(node.attrs.islandType) });
    return true;
  });
  return out;
}

function endOf(editor: Editor, needle: string): number {
  let at = -1;
  editor.state.doc.descendants((node, pos) => {
    if (at === -1 && node.isTextblock && node.textContent.includes(needle)) at = pos + 1 + node.content.size;
    return at === -1;
  });
  if (at === -1) throw new Error(`no textblock contains ${needle}`);
  return at;
}

describe("a ```matrx fence in Write", () => {
  it("loads as one island holding the fence's exact bytes", () => {
    const { editor } = open(STORED);
    expect(islands(editor.state.doc)).toEqual([{ raw: REFERENCE, islandType: "fence" }]);
  });

  it("no edit → the stored bytes", () => {
    expect(open(STORED).save()).toBe(STORED);
  });

  it("typing beside it changes only the typed bytes", () => {
    const { editor, save } = open(STORED);
    editor.commands.insertContentAt(endOf(editor, "Trucks arrive at 6."), " Gate B.");
    expect(save()).toBe(STORED.replace("Trucks arrive at 6.", "Trucks arrive at 6. Gate B."));
  });

  it("an inserted reference (the menu's caret text) is an island, saved byte-for-byte on its own paragraph", () => {
    const { editor, save } = open("Trucks arrive at 6.\n\nBay 3 is closed.\n");
    const at = endOf(editor, "Trucks arrive at 6.");
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at)));
    const tr = editor.state.tr;
    replaceSelectionWithMarkdown(tr, editor.state.schema, `\n\n${ACTION}\n\n`);
    editor.view.dispatch(tr);
    expect(islands(editor.state.doc)).toEqual([{ raw: ACTION, islandType: "fence" }]);
    expect(save()).toBe(`Trucks arrive at 6.\n\n${ACTION}\n\nBay 3 is closed.\n`);
    // Nothing of the JSON leaked into prose.
    let prose = "";
    editor.state.doc.descendants((node) => {
      if (node.isText) prose += node.text;
      return true;
    });
    expect(prose).not.toContain("__kind");
  });

  it("is named in plain words (a chip or a card), never as code or a kind slug", () => {
    expect(isMatrxFence("fence", REFERENCE)).toBe(true);
    expect(isMatrxFence("fence", "```python\nprint(1)\n```")).toBe(false);
    expect(islandMeta("fence", REFERENCE).label).toBe("Reference");
    expect(islandMeta("fence", ACTION).label).toBe("Action");
  });
});
