/**
 * A right-click in Write puts the caret where the person clicked (G8B review,
 * 2026-10-02: with no click in the text first, "Insert reference…" put the
 * chip at the end of the note, not where the right-click was).
 * SUT: the browser editor's own extension list (`createVisualExtensions`) on a
 * real Tiptap editor; ProseMirror's `posAtCoords` is stubbed because jsdom has
 * no layout — the hit it returns is what a real click there resolves to.
 */
import { Editor, getSchema, type JSONContent } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { createRichEditorExtensions } from "../core/extensions";
import { buildVisualDocument } from "../core/visual-document";
import { createVisualExtensions, type RichShellActions } from "../visual/visual-extensions";
import { selectionForContextMenu } from "../visual/context-menu-caret";

const schema = getSchema(createRichEditorExtensions());
const SOURCE = "First paragraph.\n\nSecond paragraph here.\n\n```matrx\n{\"a\":1}\n```\n\nLast one.\n";

const noop = () => {};
const shell = new Proxy({} as RichShellActions, {
  get: (_target, prop) => (prop === "variables" ? () => null : prop === "exitFocus" ? () => false : noop),
});

function textPos(editor: Editor, needle: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found !== -1) return false;
    if (node.isText && node.text?.includes(needle)) found = pos + node.text.indexOf(needle);
    return found === -1;
  });
  return found;
}

function islandPos(editor: Editor): number {
  let found = -1;
  editor.state.doc.forEach((node, offset) => {
    if (found === -1 && node.type.name === "islandBlock") found = offset;
  });
  return found;
}

function mount(): Editor {
  const { json } = buildVisualDocument(SOURCE, schema);
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({ element, extensions: createVisualExtensions({ shell }), content: json as JSONContent });
}

function rightClick(editor: Editor, hit: { pos: number; inside: number }) {
  editor.view.posAtCoords = () => hit;
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
  editor.view.dom.dispatchEvent(event);
}

describe("a right-click in Write places the caret", () => {
  it("moves a caret the person never placed to the click", () => {
    const editor = mount();
    // The stale selection: the very start of the note.
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.atStart(editor.state.doc)));
    const target = textPos(editor, "here");
    rightClick(editor, { pos: target, inside: -1 });
    expect(editor.state.selection.from).toBe(target);
    editor.destroy();
  });

  it("keeps a selection the click is inside", () => {
    const editor = mount();
    const from = textPos(editor, "Second");
    const to = from + "Second paragraph".length;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)));
    rightClick(editor, { pos: from + 3, inside: -1 });
    expect([editor.state.selection.from, editor.state.selection.to]).toEqual([from, to]);
    editor.destroy();
  });

  it("selects the chip it lands on", () => {
    const editor = mount();
    const at = islandPos(editor);
    rightClick(editor, { pos: at + 1, inside: at });
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.state.selection.from).toBe(at);
    editor.destroy();
  });

  it("no hit (outside the text) keeps the selection", () => {
    const editor = mount();
    expect(selectionForContextMenu(editor.state, null)).toBeNull();
    editor.destroy();
  });
});
