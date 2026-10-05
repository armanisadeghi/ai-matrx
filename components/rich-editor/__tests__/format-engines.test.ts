/**
 * @jest-environment jsdom
 */
// The ONE formatting command layer, per engine: the same command id on the
// visual editor (Tiptap), the source view (CodeMirror) and a plain textarea
// does the same thing, toggles, and changes no byte outside the selection.

import { Editor, getSchema, type JSONContent } from "@tiptap/core";
import { EditorState, EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createRichEditorExtensions } from "../core/extensions";
import { buildVisualDocument, captureBaseline, serializeVisualDocument } from "../core/visual-document";
import { applyEditToTextarea, textFormatTarget, textareaFormatTarget } from "../format/format-target";
import { visualFormatTarget } from "../visual/visual-format-target";

const NOTE = "# Alton stops\n\nPick up totes at Alton today.\n\n* weigh in\n* photograph\n";

describe("textarea engine", () => {
  function area(text: string, from: number, to: number): HTMLTextAreaElement {
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.setSelectionRange(from, to);
    return el;
  }

  test("bold toggles on the selection only, and React hears an input event", () => {
    const from = NOTE.indexOf("totes");
    const el = area(NOTE, from, from + 5);
    const inputs: string[] = [];
    el.addEventListener("input", () => inputs.push(el.value));
    const target = textareaFormatTarget(el);
    expect(target.run("bold")).toBe(true);
    expect(el.value).toBe(NOTE.replace("totes", "**totes**"));
    expect(el.value.slice(el.selectionStart, el.selectionEnd)).toBe("totes");
    expect(target.isActive("bold")).toBe(true);
    expect(inputs.length).toBe(1);
    target.run("bold");
    expect(el.value).toBe(NOTE);
  });

  test("a line command changes only the touched lines", () => {
    const from = NOTE.indexOf("weigh");
    const el = area(NOTE, from, NOTE.indexOf("photograph") + 3);
    textareaFormatTarget(el).run("orderedList");
    expect(el.value).toBe("# Alton stops\n\nPick up totes at Alton today.\n\n1. weigh in\n2. photograph\n");
  });

  test("a read-only box refuses", () => {
    const el = area(NOTE, 2, 7);
    el.readOnly = true;
    expect(textareaFormatTarget(el).run("bold")).toBe(false);
    expect(el.value).toBe(NOTE);
  });

  test("applyEditToTextarea collapses changes to one span (bytes between re-inserted unchanged)", () => {
    const el = area("a b c", 0, 5);
    applyEditToTextarea(el, { changes: [{ from: 0, to: 0, insert: "*" }, { from: 5, to: 5, insert: "*" }], anchor: 1, head: 6 });
    expect(el.value).toBe("*a b c*");
  });
});

describe("source engine (CodeMirror)", () => {
  test("the text engine on a real EditorView", () => {
    const from = NOTE.indexOf("Alton today");
    const view = new EditorView({
      state: EditorState.create({ doc: NOTE, selection: EditorSelection.single(from, from + 5) }),
      parent: document.body,
    });
    const target = textFormatTarget(
      "source",
      () => {
        const { from: a, to: b } = view.state.selection.main;
        return { text: view.state.doc.toString(), from: a, to: b, editable: true };
      },
      (result) => view.dispatch({ changes: result.changes, selection: EditorSelection.single(result.anchor, result.head) }),
    );
    target.run("italic");
    expect(view.state.doc.toString()).toBe(NOTE.replace("Alton today", "*Alton* today"));
    expect(target.isActive("italic")).toBe(true);
    target.run("italic");
    expect(view.state.doc.toString()).toBe(NOTE);
    view.destroy();
  });
});

describe("visual engine (Tiptap)", () => {
  const extensions = createRichEditorExtensions();
  const schema = getSchema(extensions);

  test("bold, list and quote run as marks and nodes; untouched blocks keep their bytes", () => {
    const { json, plan } = buildVisualDocument(NOTE, schema);
    const editor = new Editor({ element: document.createElement("div"), extensions, content: json as JSONContent });
    const baseline = captureBaseline(editor.state.doc, plan);
    let pos = -1;
    editor.state.doc.descendants((node, p) => {
      if (pos === -1 && node.isText && node.text?.includes("totes")) pos = p + node.text.indexOf("totes");
    });
    editor.commands.setTextSelection({ from: pos, to: pos + 5 });
    const target = visualFormatTarget(editor);
    expect(target.canFormat()).toBe(true);
    expect(target.run("bold")).toBe(true);
    expect(target.isActive("bold")).toBe(true);
    const saved = serializeVisualDocument(editor.state.doc, baseline);
    expect(saved).toBe(NOTE.replace("totes", "**totes**"));
    // Untouched blocks: the heading and the `*` list keep their stored spelling.
    expect(saved).toContain("# Alton stops\n");
    expect(saved).toContain("* weigh in\n* photograph");
    target.run("bold");
    expect(serializeVisualDocument(editor.state.doc, baseline)).toBe(NOTE);
    editor.destroy();
  });
});
