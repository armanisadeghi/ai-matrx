// components/rich-editor/core/commands.ts
//
// Every editing verb of the visual mode, as plain functions over a Tiptap
// Editor — the slash menu, the selection toolbar, the keymap, the drag handle
// and the tests all call these, so a verb behaves the same from every door.
// React-free: the headless tests drive exactly this code.
//
// Islands are only ever CREATED here with their exact markdown bytes (a fence,
// `$$…$$`, `<!-- pagebreak -->`, kind JSON) or REPLACED through
// `replaceIslandRaw` — the explicit island edit. Nothing here re-serializes an
// island.

import type { Editor } from "@tiptap/core";
import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { PAGE_BREAK_MARKDOWN } from "@ai-matrx/print/directives";

export type CalloutType = "NOTE" | "TIP" | "IMPORTANT" | "WARNING" | "CAUTION";
export const CALLOUT_TYPES: readonly CalloutType[] = ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"];

export const TASK_OPEN = "[ ] ";
export const TASK_DONE = "[x] ";

/** A fenced code block with a fence longer than any backtick run in the code. */
export function fenceMarkdown(language: string, code = ""): string {
  let longest = 0;
  for (const run of code.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}${language}\n${code}\n${fence}`;
}

export function mathBlockMarkdown(tex = ""): string {
  return `$$\n${tex}\n$$`;
}

/** Kind JSON exactly as agents emit it: `__kind` first, pretty-printed. */
export function kindMarkdown(kind: string, data: Record<string, unknown> = {}): string {
  const { __kind: _ignored, ...rest } = data;
  return JSON.stringify({ __kind: kind, ...rest }, null, 2);
}

/** Top-level index and position of the block that holds the selection. */
function topLevelAt(editor: Editor): { index: number; pos: number; node: PMNode } | null {
  const { doc, selection } = editor.state;
  const $from = selection.$from;
  const index = $from.depth === 0 ? $from.index(0) : $from.index(0);
  if (index >= doc.childCount) return null;
  let pos = 0;
  for (let i = 0; i < index; i += 1) pos += doc.child(i).nodeSize;
  return { index, pos, node: doc.child(index) };
}

/**
 * Insert a block island at the cursor: an empty paragraph is replaced, a
 * non-empty one gets the island after it. Returns the island's position.
 */
export function insertIsland(editor: Editor, raw: string, islandType: string): number {
  const { state } = editor;
  const type = state.schema.nodes.islandBlock;
  if (!type) return -1;
  const island = type.create({ raw, islandType, complete: true });
  const { $from } = state.selection;
  let at = -1;
  editor.commands.command(({ tr }) => {
    const parent = $from.parent;
    if (state.selection instanceof NodeSelection) {
      at = state.selection.to;
      tr.insert(at, island);
    } else if (parent.isTextblock && parent.content.size === 0 && $from.depth > 0) {
      at = $from.before($from.depth);
      tr.replaceWith(at, $from.after($from.depth), island);
    } else {
      at = $from.depth > 0 ? $from.after(Math.min($from.depth, 2) || 1) : $from.pos;
      tr.insert(at, island);
    }
    tr.setSelection(NodeSelection.create(tr.doc, at));
    return true;
  });
  return at;
}

export function insertCodeBlock(editor: Editor, language = ""): number {
  return insertIsland(editor, fenceMarkdown(language), "fence");
}

export function insertMathBlock(editor: Editor, tex = ""): number {
  return insertIsland(editor, mathBlockMarkdown(tex), "math_block");
}

export function insertPageBreak(editor: Editor): number {
  return insertIsland(editor, PAGE_BREAK_MARKDOWN, "html_comment");
}

export function insertKind(editor: Editor, kind: string, data: Record<string, unknown> = {}): number {
  return insertIsland(editor, kindMarkdown(kind, data), "json");
}

/** An inline island (variable, inline math) at the cursor. */
export function insertInlineIsland(editor: Editor, raw: string, islandType: string): boolean {
  const type = editor.state.schema.nodes.inlineIsland;
  if (!type) return false;
  return editor
    .chain()
    .focus()
    .command(({ tr }) => {
      tr.replaceSelectionWith(type.create({ raw, islandType }), false);
      return true;
    })
    .run();
}

export function insertVariable(editor: Editor, name: string): boolean {
  return insertInlineIsland(editor, `{{${name}}}`, "variable");
}

export function insertInlineMath(editor: Editor, tex: string): boolean {
  return insertInlineIsland(editor, `$${tex}$`, "math_inline");
}

/** Replace an island's bytes — the one explicit island edit. */
export function replaceIslandRaw(editor: Editor, pos: number, raw: string): boolean {
  const node = editor.state.doc.nodeAt(pos);
  if (!node || (node.type.name !== "islandBlock" && node.type.name !== "inlineIsland" && node.type.name !== "sourceLocked")) {
    return false;
  }
  if (node.attrs.raw === raw) return true;
  return editor.commands.command(({ tr }) => {
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, raw });
    return true;
  });
}

export function removeNodeAt(editor: Editor, pos: number): boolean {
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return false;
  return editor.commands.command(({ tr }) => {
    tr.delete(pos, pos + node.nodeSize);
    return true;
  });
}

export function setCallout(editor: Editor, type: CalloutType | null): boolean {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "blockquote") {
      const pos = $from.before(depth);
      return editor.commands.command(({ tr }) => {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, mdAlert: type ? `[!${type}]` : null });
        return true;
      });
    }
  }
  if (!type) return false;
  return editor
    .chain()
    .focus()
    .toggleBlockquote()
    .command(({ tr }) => {
      const $pos = tr.selection.$from;
      for (let depth = $pos.depth; depth > 0; depth -= 1) {
        const node = $pos.node(depth);
        if (node.type.name === "blockquote") {
          tr.setNodeMarkup($pos.before(depth), undefined, { ...node.attrs, mdAlert: `[!${type}]` });
          return true;
        }
      }
      return false;
    })
    .run();
}

/** Turn the current list (or paragraph) into a checklist, or back. */
export function toggleTaskList(editor: Editor): boolean {
  const { $from } = editor.state.selection;
  let itemDepth = -1;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === "listItem") {
      itemDepth = depth;
      break;
    }
  }
  if (itemDepth === -1) {
    if (!editor.chain().focus().toggleBulletList().run()) return false;
    return toggleTaskList(editor);
  }
  const list = $from.node(itemDepth - 1);
  const listPos = $from.before(itemDepth - 1);
  const makeTask = list.firstChild?.attrs.mdTask === null || list.firstChild?.attrs.mdTask === undefined;
  return editor.commands.command(({ tr }) => {
    list.forEach((item, offset) => {
      tr.setNodeMarkup(listPos + 1 + offset, undefined, {
        ...item.attrs,
        mdTask: makeTask ? (item.attrs.mdTask ?? TASK_OPEN) : null,
      });
    });
    return true;
  });
}

export function toggleTaskChecked(editor: Editor, itemPos: number): boolean {
  const item = editor.state.doc.nodeAt(itemPos);
  if (!item || item.type.name !== "listItem" || item.attrs.mdTask === null) return false;
  const checked = /\[[xX]\]/.test(String(item.attrs.mdTask));
  return editor.commands.command(({ tr }) => {
    tr.setNodeMarkup(itemPos, undefined, { ...item.attrs, mdTask: checked ? TASK_OPEN : TASK_DONE });
    return true;
  });
}

/** Footnote numbers already used in the document text. */
export function nextFootnoteNumber(text: string): number {
  let max = 0;
  for (const match of text.matchAll(/\[\^(\d+)\]/g)) max = Math.max(max, Number(match[1]));
  return max + 1;
}

/**
 * Insert a footnote reference at the cursor and its definition at the end of
 * the document; the cursor lands in the definition.
 */
export function insertFootnote(editor: Editor): number {
  const n = nextFootnoteNumber(editor.state.doc.textContent);
  const paragraph = editor.state.schema.nodes.paragraph;
  if (!paragraph) return -1;
  editor.commands.command(({ tr }) => {
    tr.insertText(`[^${n}]`);
    const end = tr.doc.content.size;
    tr.insert(end, paragraph.create(null, editor.state.schema.text(`[^${n}]: `)));
    tr.setSelection(TextSelection.create(tr.doc, tr.doc.content.size - 1));
    return true;
  });
  return n;
}

/**
 * Move the block holding the cursor one step up or down among its siblings
 * (a paragraph inside a stored block moves inside it; a whole stored block or
 * island moves among the document's blocks).
 */
export function moveBlock(editor: Editor, direction: "up" | "down"): boolean {
  const { state } = editor;
  const selection = state.selection;
  let depth: number;
  const $from = selection.$from;
  if (selection instanceof NodeSelection && $from.depth === 0) depth = 0;
  else depth = $from.depth >= 2 && $from.node(1).type.name === "sourceBlock" && $from.node(1).childCount > 1 ? 1 : 0;
  const parent = $from.node(depth);
  const index = $from.index(depth);
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= parent.childCount) return false;
  const start = depth === 0 ? 0 : $from.start(depth);
  const offsetOf = (i: number) => {
    let pos = start;
    for (let k = 0; k < i; k += 1) pos += parent.child(k).nodeSize;
    return pos;
  };
  const first = direction === "up" ? target : index;
  const firstNode = parent.child(first);
  const secondNode = parent.child(first + 1);
  const from = offsetOf(first);
  const movingFrom = offsetOf(index);
  const selectionOffset = selection.from - movingFrom;
  return editor.commands.command(({ tr }) => {
    tr.replaceWith(from, from + firstNode.nodeSize + secondNode.nodeSize, Fragment.from([secondNode, firstNode]));
    const movedTo = direction === "up" ? from : from + secondNode.nodeSize;
    tr.setSelection(
      selection instanceof NodeSelection
        ? NodeSelection.create(tr.doc, movedTo)
        : TextSelection.near(tr.doc.resolve(Math.min(movedTo + selectionOffset, tr.doc.content.size))),
    );
    return true;
  });
}

/** ```lang typed on its own line + Enter → a code block island. */
export function fenceFromParagraph(editor: Editor): boolean {
  const { $from, empty } = editor.state.selection;
  if (!empty || !$from.parent.isTextblock || $from.parent.type.name !== "paragraph") return false;
  const match = /^(`{3,}|~{3,})([\w+#.-]*)$/.exec($from.parent.textContent);
  if (!match) return false;
  const pos = $from.before($from.depth);
  const island = editor.state.schema.nodes.islandBlock?.create({
    raw: `${match[1]}${match[2]}\n\n${match[1]}`,
    islandType: "fence",
    complete: true,
  });
  if (!island) return false;
  return editor.commands.command(({ tr }) => {
    tr.replaceWith(pos, pos + $from.parent.nodeSize, island);
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    return true;
  });
}

/** The top-level node (and its position) at a document position. */
export function topLevelNodeAt(doc: PMNode, pos: number): { node: PMNode; pos: number } | null {
  let offset = 0;
  for (let i = 0; i < doc.childCount; i += 1) {
    const node = doc.child(i);
    if (pos >= offset && pos < offset + node.nodeSize) return { node, pos: offset };
    offset += node.nodeSize;
  }
  return null;
}

export { topLevelAt };
