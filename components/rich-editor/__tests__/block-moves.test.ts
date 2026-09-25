/**
 * A block move rewrites nothing but the order.
 *
 * SUT: moveBlock (⌘⇧↑/↓, the grip menu) and the grip's drag-drop path (a
 * NodeSelection slice dropped elsewhere, exactly the transactions ProseMirror's
 * drop handler dispatches — so every appendTransaction plugin runs), judged by
 * serializeVisualDocument against the stored bytes.
 *
 * The owner's rule: moving a block never changes the bytes of ANY block — the
 * moved one keeps its stored bytes, and every neighbour it passes stays
 * byte-identical. The fixture is one realistic document holding every block
 * spelling a serializer would "normalize": bare URLs and emails, autolinks,
 * both emphasis spellings, reference links, raw HTML, escapes, islands. The
 * expected value is the same blocks in the new order — nothing else.
 */
import { Editor, getSchema, type JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { createRichEditorExtensions } from "../core/extensions";
import { buildVisualDocument, captureBaseline, serializeVisualDocument } from "../core/visual-document";
import { moveBlock } from "../core/commands";

const extensions = createRichEditorExtensions();
const schema = getSchema(extensions);
const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
});

/** A loading-dock onboarding brief; every entry is one stored block. */
export const MOVE_BLOCKS: readonly string[] = [
  "# Loading-dock onboarding — {{site_name}}",
  "Questions go to the shift lead, or email ops@example.com.",
  "Portal: https://dock.example.com/checkin and <https://example.com/badges>.",
  "Read the __first week__ plan, then the *safety* and **forklift** notes; _gloves_ always.",
  "See the [forklift checklist][fc] and [the map](https://example.com/map \"Yard map\").",
  "[fc]: https://example.com/forklift",
  "Wear <b>steel toes</b> in bay 4 &amp; bay 5; prices are \\*estimates\\*.",
  "<div class=\"notice\">\nNo phones on the dock floor.\n</div>",
  "```matrx\n{\"__kind\":\"code_block\",\"language\":\"bash\",\"code\":\"dock status\"}\n```",
  "<safety_rules>\nNever stand under a raised load.\n</safety_rules>",
  "| Bay | Door |\n|:----|:----:|\n| 4   | {{door_code}} |",
  "- [ ] Badge photo\n- [x] Safety video",
  "* pallets\n* skids",
  "1) Sign in\n2) Walk the yard",
  "> Tip from Devin: count twice.",
  "> [!WARNING]\n> Doors close at 6pm.",
  "```bash\nforklift --check {{unit_id}}\n```",
  "$$\nt = \\frac{d}{1.25}\n$$",
  "Your trainer is {{shift_lead}}; inline math $a^2$ is fine.[^1]",
  "[^1]: Ask for the laminated card.",
  "***",
  "<!-- reviewer: keep this -->",
  "Thanks for joining the crew!",
];

const FIXTURE = MOVE_BLOCKS.join("\n\n");

function open(text: string) {
  const { json, plan } = buildVisualDocument(text, schema);
  const editor = new Editor({ element: document.createElement("div"), extensions, content: json as JSONContent });
  editors.push(editor);
  const baseline = captureBaseline(editor.state.doc, plan);
  return { editor, save: () => serializeVisualDocument(editor.state.doc, baseline) };
}

function topPos(editor: Editor, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i += 1) pos += editor.state.doc.child(i).nodeSize;
  return pos;
}

function selectTop(editor: Editor, index: number): void {
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, topPos(editor, index))));
}

/** ProseMirror's own drop: delete the dragged selection, insert its slice at the mapped drop point. */
function dragTop(editor: Editor, from: number, to: number): void {
  selectTop(editor, from);
  const slice = editor.state.selection.content();
  const dropAt = topPos(editor, to);
  const tr = editor.state.tr;
  tr.deleteSelection();
  const pos = tr.mapping.map(dropAt);
  const node = slice.openStart === 0 && slice.openEnd === 0 && slice.content.childCount === 1 ? slice.content.firstChild : null;
  if (node) tr.replaceRangeWith(pos, pos, node);
  else tr.replaceRange(pos, pos, slice);
  // ProseMirror tags its drop transaction exactly like this; plugins that react
  // to drops (Tiptap's paste rules re-mark the whole changed range) key on it.
  editor.view.dispatch(tr.setMeta("uiEvent", "drop"));
}

function reorder(blocks: readonly string[], from: number, to: number): string[] {
  const next = [...blocks];
  const [moved] = next.splice(from, 1);
  next.splice(from < to ? to - 1 : to, 0, moved);
  return next;
}

describe("the fixture is one stored block per entry", () => {
  it("loads as exactly one top-level node per block and round-trips byte-exact", () => {
    const { editor, save } = open(FIXTURE);
    expect(editor.state.doc.childCount).toBe(MOVE_BLOCKS.length);
    expect(save()).toBe(FIXTURE);
  });
});

describe("⌘⇧↑ / ⌘⇧↓ move only the order", () => {
  for (let index = 0; index < MOVE_BLOCKS.length; index += 1) {
    const label = MOVE_BLOCKS[index].split("\n")[0].slice(0, 40);
    if (index > 0) {
      it(`up: ${label}`, () => {
        const { editor, save } = open(FIXTURE);
        selectTop(editor, index);
        expect(moveBlock(editor, "up")).toBe(true);
        expect(save()).toBe(reorder(MOVE_BLOCKS, index, index - 1).join("\n\n"));
      });
    }
    if (index < MOVE_BLOCKS.length - 1) {
      it(`down: ${label}`, () => {
        const { editor, save } = open(FIXTURE);
        selectTop(editor, index);
        expect(moveBlock(editor, "down")).toBe(true);
        expect(save()).toBe(reorder(MOVE_BLOCKS, index, index + 2).join("\n\n"));
      });
    }
  }
});

describe("a grip drag-drop moves only the order", () => {
  for (let index = 0; index < MOVE_BLOCKS.length; index += 1) {
    const label = MOVE_BLOCKS[index].split("\n")[0].slice(0, 40);
    const to = index < 3 ? index + 4 : index - 3;
    it(`drag ${label} → before block ${to}`, () => {
      const { editor, save } = open(FIXTURE);
      dragTop(editor, index, to);
      expect(save()).toBe(reorder(MOVE_BLOCKS, index, to).join("\n\n"));
    });
  }

  it("a drag to the very end keeps every block", () => {
    const { editor, save } = open(FIXTURE);
    dragTop(editor, 1, MOVE_BLOCKS.length);
    expect(save()).toBe(reorder(MOVE_BLOCKS, 1, MOVE_BLOCKS.length).join("\n\n"));
  });
});

describe("plain-text paste is parsed as markdown (the same structure as typing it in Source)", () => {
  // jsdom has no ClipboardEvent; ProseMirror's pasteText only needs the type to construct.
  beforeAll(() => {
    if (typeof globalThis.ClipboardEvent === "undefined") {
      (globalThis as { ClipboardEvent?: unknown }).ClipboardEvent = class extends Event {
        readonly clipboardData = null;
      };
    }
  });
  const BASE = "Questions go to the shift lead, or email ops@example.com.\n\nPrices are \\*estimates\\*.\n\nLast line.";

  function pasteAtEndOf(editor: Editor, needle: string, text: string): void {
    let target = -1;
    editor.state.doc.descendants((node, pos) => {
      if (target === -1 && node.isTextblock && node.textContent.includes(needle)) target = pos + 1 + node.content.size;
      return target === -1;
    });
    editor.commands.setTextSelection(target);
    editor.view.pasteText(text);
  }

  it("a pasted list, XML section and variable land as a list, one island and a chip — written back byte-for-byte", () => {
    const { editor, save } = open(BASE);
    const pasted = "- [ ] Badge photo\n- [x] Safety video\n\n<safety_rules>\nNever stand under a raised load.\n</safety_rules>\n\nYour lead is {{shift_lead}}.";
    // Paste into a fresh empty paragraph after the last line, as a person would after pressing Enter.
    pasteAtEndOf(editor, "Last line.", "");
    editor.commands.setTextSelection(editor.state.doc.content.size - 2);
    editor.commands.enter();
    editor.view.pasteText(pasted);
    const types: string[] = [];
    editor.state.doc.descendants((node) => {
      types.push(node.type.name);
      return true;
    });
    expect(types).toContain("bulletList");
    expect(types).toContain("islandBlock");
    expect(types).toContain("inlineIsland");
    expect(save()).toBe(`${BASE}\n\n${pasted}`);
  });

  it("a one-line paste joins the line the cursor is in", () => {
    const { editor, save } = open(BASE);
    pasteAtEndOf(editor, "Last line", " Ask **Devin** about {{dock_door}}.");
    expect(save()).toBe(`${BASE} Ask **Devin** about {{dock_door}}.`);
  });

  it("a paste never rewrites the untouched blocks around it (no paste rules re-marking links or escapes)", () => {
    const { editor, save } = open(BASE);
    pasteAtEndOf(editor, "Last line", " https://example.com/new and *new* text");
    expect(save()).toBe(`${BASE} https://example.com/new and *new* text`);
  });
});
