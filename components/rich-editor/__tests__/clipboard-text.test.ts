/**
 * Copying from the visual view keeps the blank lines of the text.
 *
 * SUT: the clipboard text/plain ProseMirror asks the editor for on copy
 * (view.someProp("clipboardTextSerializer") — the first plugin that answers
 * wins, exactly as on a real ⌘C). Before the fix every blank line between
 * blocks came out as three and the copy began with a blank line, because each
 * stored block's `sourceBlock` wrapper and its paragraph both added one.
 */
import { Editor, getSchema, type JSONContent } from "@tiptap/core";
import { AllSelection, TextSelection } from "@tiptap/pm/state";
import { createRichEditorExtensions } from "../core/extensions";
import { buildVisualDocument } from "../core/visual-document";

const extensions = createRichEditorExtensions();
const schema = getSchema(extensions);
const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
});

function open(text: string) {
  const { json } = buildVisualDocument(text, schema);
  const editor = new Editor({ element: document.createElement("div"), extensions, content: json as JSONContent });
  editors.push(editor);
  return editor;
}

function copyAll(editor: Editor): string {
  editor.view.dispatch(editor.state.tr.setSelection(new AllSelection(editor.state.doc)));
  const serialize = editor.view.someProp("clipboardTextSerializer");
  if (!serialize) throw new Error("no clipboardTextSerializer answered");
  return serialize(editor.state.selection.content(), editor.view);
}

const POLICY = [
  "**Data Protection Laws — Additions**",
  "**1. Field-level classification.** Classify at the field level, not the table level.",
  "**2. Protection state is an orthogonal axis.** Note that `auth.users.encrypted_password` is a bcrypt **hash**.",
].join("\n\n");

describe("visual copy as plain text", () => {
  it("puts exactly one blank line between paragraphs, none before the first", () => {
    expect(copyAll(open(POLICY))).toBe(
      [
        "Data Protection Laws — Additions",
        "1. Field-level classification. Classify at the field level, not the table level.",
        "2. Protection state is an orthogonal axis. Note that auth.users.encrypted_password is a bcrypt hash.",
      ].join("\n\n"),
    );
  });

  it("keeps headings, list items and hard breaks one separator apart", () => {
    const text = "## Dock rules\n\n- Gloves on\n- Badge visible\n\nCall the lead  \nbefore lifting.";
    expect(copyAll(open(text))).toBe("Dock rules\n\nGloves on\n\nBadge visible\n\nCall the lead\nbefore lifting.");
  });

  it("adds nothing for an empty last line", () => {
    const editor = open("Gloves on.\n\nBadge visible.");
    editor.commands.insertContentAt(editor.state.doc.content.size, { type: "paragraph" });
    expect(copyAll(editor)).toBe("Gloves on.\n\nBadge visible.");
  });

  it("copies a partial selection across two blocks with one blank line", () => {
    const editor = open("First paragraph here.\n\nSecond paragraph here.");
    const doc = editor.state.doc;
    let from = 0;
    let to = 0;
    doc.descendants((node, pos) => {
      if (node.isText && node.text?.startsWith("First")) from = pos + "First ".length;
      if (node.isText && node.text?.startsWith("Second")) to = pos + "Second".length;
    });
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(doc, from, to)));
    const serialize = editor.view.someProp("clipboardTextSerializer");
    expect(serialize?.(editor.state.selection.content(), editor.view)).toBe("paragraph here.\n\nSecond");
  });
});
