/**
 * SAFETY (verify-RC-B8 round 2): a callout or `:::` directive nested in a list
 * item survives the editor untouched. Opening such a note in the visual
 * editor and saving it — with no edit, and with an edit to the NEXT item —
 * must write back exactly the stored bytes around the edit, and the nested
 * construct must stay under its item (never moved, never re-indented).
 *
 * Use case: a kiln-loading checklist whose first step carries a caution.
 */
import { Editor, getSchema, type JSONContent } from "@tiptap/core";
import { createRichEditorExtensions } from "../core/extensions";
import { buildVisualDocument, captureBaseline, serializeVisualDocument } from "../core/visual-document";
import { planSave } from "../core/save-plan";

const extensions = createRichEditorExtensions();
const schema = getSchema(extensions);
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

const CASES: [string, string][] = [
  ["bullet callout", "Kiln checklist\n\n- Load shelves\n  > [!caution] Hot surfaces\n  > Wear gloves.\n- Close the lid\n"],
  ["numbered callout after a blank", "1. Mix the glaze\n\n   > [!tip] Sieve twice\n   > 80-mesh.\n2. Dip the ware\n"],
  ["directive in a list item", "- Before firing\n  :::note\n  Check the kiln sitter.\n  :::\n- After firing\n"],
];

describe("a list-nested callout or directive round-trips through the editor", () => {
  it.each(CASES)("%s: open → save with no edit writes back the stored bytes", (_name, text) => {
    const saved = open(text).save();
    expect(saved).toBe(text);
    const plan = planSave(text, saved);
    expect(plan.changed).toBe(false);
    expect(plan.text).toBe(text);
  });

  it.each(CASES)("%s: two open/save cycles never drift", (_name, text) => {
    const again = open(open(text).save()).save();
    expect(again).toBe(text);
  });
});


describe("editing beside a list-nested callout saves byte-exact", () => {
  it("typing into the NEXT item changes exactly those bytes — the callout under the first item is untouched", () => {
    const [, text] = CASES[0] as [string, string];
    const session = open(text);
    let at = -1;
    session.editor.state.doc.descendants((node, pos) => {
      if (at !== -1) return false;
      if (node.isText && node.text?.includes("Close the lid")) {
        at = pos + node.text.indexOf("Close the lid") + "Close the lid".length;
        return false;
      }
      return true;
    });
    expect(at).toBeGreaterThan(-1);
    session.editor.commands.command(({ tr }) => {
      tr.insert(at, session.editor.schema.text(" firmly"));
      return true;
    });
    const saved = session.save();
    expect(saved).toBe(text.replace("Close the lid", "Close the lid firmly"));
    const plan = planSave(text, saved);
    expect(plan.needsConsent).toEqual([]);
    expect(plan.text).toBe(saved);
  });
});
