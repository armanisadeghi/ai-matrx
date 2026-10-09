/**
 * Round 38 (D1): a modal opening marks the page `aria-hidden` and, keeping every `[aria-live]` element, walks
 * into the editor and marks its block elements too. ProseMirror read that as an edit and redrew the block —
 * a database block's table remounted and its open Archive confirm closed ~150 ms after it opened. The Spaces
 * editor ignores those two marks; a real edit to the DOM is still read.
 */
import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { EditorView } from "@tiptap/pm/view";

import { outsideAriaMarksPlugin } from "../aria-hidden-marks";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "text*", toDOM: () => ["p", 0], parseDOM: [{ tag: "p" }] },
    text: {},
  },
});

function mount(guarded: boolean) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("Recall list")]), schema.node("paragraph", null, [schema.text("Due Friday")])]);
  const view = new EditorView(host, { state: EditorState.create({ doc, plugins: guarded ? [outsideAriaMarksPlugin()] : [] }) });
  return view;
}

const flush = (view: EditorView) => (view as unknown as { domObserver: { flush(): void } }).domObserver.flush();

it.each([true, false])("a modal's aria-hidden mark on a block (guarded: %s)", (guarded) => {
  const view = mount(guarded);
  const first = view.dom.firstChild as HTMLElement;
  first.setAttribute("aria-hidden", "true");
  first.setAttribute("data-aria-hidden", "true");
  flush(view);
  // Guarded: the block the person sees is the same element (nothing under it remounts). Unguarded: ProseMirror redraws it.
  expect(view.dom.firstChild === first).toBe(guarded);
  view.destroy();
});

it("a real change to the editor's DOM is still read", () => {
  const view = mount(true);
  const first = view.dom.firstChild as HTMLElement;
  first.setAttribute("class", "pasted-by-hand");
  flush(view);
  expect(view.dom.firstChild === first).toBe(false);
  view.destroy();
});
