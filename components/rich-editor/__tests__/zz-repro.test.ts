import { Editor, getSchema, type JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { createRichEditorExtensions } from "../core/extensions";
import { buildVisualDocument, captureBaseline, serializeVisualDocument } from "../core/visual-document";
import { moveBlock } from "../core/commands";
const V5 = "# Loading-dock onboarding brief — {{site_name}}\n\nWelcome, {{new_hire_name}}. This brief covers your first week at the __{{site_name}}__ dock. Read it *before* your first shift; your lead is {{shift_lead}}.\n\n## First-week checklist\n\n- [x] Collect badge and vest\n- [ ] Shadow {{shift_lead}} on bay 3\n- [ ] Pass forklift practical[^1]\n\n* Break room: north corridor\n* Lockers: bring your own lock\n\n---\n\nQuestions? Ping #dock-ops or email ops@example.com.\n\n<safety_rules>\n1. Chock every trailer before the forklift enters.\n</safety_rules>\n\n[^1]: The practical is scheduled by HR within 10 days of your start date.\n";
const extensions = createRichEditorExtensions();
const schema = getSchema(extensions);
it("repro", () => {
  const { json, plan } = buildVisualDocument(V5, schema);
  const editor = new Editor({ element: document.createElement("div"), extensions, content: json as JSONContent });
  const baseline = captureBaseline(editor.state.doc, plan);
  const tops: string[] = [];
  editor.state.doc.forEach((n) => tops.push(`${n.type.name}:${n.childCount}:${n.textContent.slice(0, 30)}`));
  console.log(tops.join("\n"));
  const q = editor.state.doc.toJSON();
  console.log(JSON.stringify(q.content.find((n: any) => JSON.stringify(n).includes("Questions")), null, 0));
  // drag the checklist (index 3) to after safety_rules (index 7)
  let pos = 0; for (let i = 0; i < 3; i++) pos += editor.state.doc.child(i).nodeSize;
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
  const slice = editor.state.selection.content();
  let drop = 0; for (let i = 0; i < 8; i++) drop += editor.state.doc.child(i).nodeSize;
  const tr = editor.state.tr; tr.deleteSelection(); const p = tr.mapping.map(drop);
  tr.replaceRange(p, p, slice); editor.view.dispatch(tr);
  console.log(serializeVisualDocument(editor.state.doc, baseline));
  editor.destroy();
});
