// components/rich-editor/visual/format-actions.ts
//
// The rich editor's formatting as actions of the ONE Alchemy registry, shown
// by the ONE selection toolbar (components/selection-toolbar) while the person
// edits: bold, italic, strikethrough, code, link, heading, quote, list — and
// "make variable" on prompt surfaces. Every action is the same verb its
// keyboard shortcut runs. The editor registers its half of the click target
// (`richEditor`) on its selection zone; nothing here renders.

import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  Braces,
  Columns3,
  Rows3,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { Action, ActionProvider, ClickTarget } from "@ai-matrx/alchemy/actions";
import { registerAlchemyIcon } from "@ai-matrx/rich-content/utils/alchemy-icon-keys";
import { declareSelectionProvider, hostHalf, placeSelectionActions, shownInSelectionMode } from "@ai-matrx/rich-content/selection-toolbar/selection-actions";
import { insertCodeBlock, insertVariable, setColumnAlign, toggleTaskList } from "../core/commands";
import type { FormatTarget } from "../format/format-target";
import { registerVisualFormatResolver } from "../format/format-actions";
import { visualFormatTarget } from "./visual-format-target";
import { markAutoEdit } from "./auto-edit";
import { toVariableName } from "../core/variables";

export const RICH_EDITOR_HOST_KEY = "richEditor";

export interface RichEditorSelectionHost {
  kind: "rich-editor";
  editor: Editor;
  onEditLink: () => void;
  offerVariables: boolean;
  /** The caret or selection is inside a table (its table actions show). */
  inTable: () => boolean;
}

/** A selected code block / island (a NodeSelection on it): its box and its source. */
export function islandSelectionOf(editor: Editor): { box: DOMRect; raw: string } | null {
  const { selection } = editor.state;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== "islandBlock") return null;
  const dom = editor.view.nodeDOM(selection.from);
  if (!(dom instanceof HTMLElement)) return null;
  return { box: dom.getBoundingClientRect(), raw: String(selection.node.attrs.raw ?? "") };
}

/** The table the caret is in, as a box (the toolbar's caret-mode anchor), or null. */
export function tableAnchorOf(editor: Editor): DOMRect | null {
  if (!editor.isEditable || !editor.isActive("table")) return null;
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === "table") {
      const dom = editor.view.nodeDOM($from.before(depth));
      if (dom instanceof HTMLElement) return dom.getBoundingClientRect();
    }
  }
  return null;
}

function editorOf(target: ClickTarget): RichEditorSelectionHost | null {
  const half = hostHalf<RichEditorSelectionHost>(target, RICH_EDITOR_HOST_KEY);
  return half?.kind === "rich-editor" && !half.editor.isDestroyed ? half : null;
}

/** The visual editor's half as a FormatTarget (registered with the one formatting provider). */
function visualTargetOf(target: ClickTarget): FormatTarget | null {
  const visual = editorOf(target);
  if (!visual) return null;
  const { editor } = visual;
  return visualFormatTarget(editor, {
    link: () => (visual.onEditLink(), true),
    taskList: () => toggleTaskList(editor),
    codeBlock: () => {
      markAutoEdit(editor, insertCodeBlock(editor));
      return true;
    },
  });
}

registerVisualFormatResolver(visualTargetOf);

/** "Turn into a {{variable}}" — prompt surfaces in the visual editor only. */
const VARIABLE_ACTION: Action = {
  id: "selection:format-variable",
  label: "Turn into a {{variable}}",
  icon: registerAlchemyIcon(Braces),
  category: "edit",
  order: 50,
  placement: "primary",
  preserveSelection: true,
  eligible: (t) => {
    const host = editorOf(t);
    if (!host || !host.offerVariables || !shownInSelectionMode("selection:format-variable", t)) return { status: "absent" };
    if (!visualFormatTarget(host.editor).canFormat()) return { status: "absent" };
    return { status: "available" };
  },
  run: (t) => {
    const host = editorOf(t);
    if (!host) return;
    const { editor } = host;
    const { from, to } = editor.state.selection;
    const name = toVariableName(editor.state.doc.textBetween(from, to, " "));
    if (name) insertVariable(editor, name);
  },
};

// ── Table actions — shown while the caret or selection is in a table (the old
// separate table bubble is gone: one popup). Every change rewrites only the
// table's markdown (markdown-serialize.ts).

interface TableSpec {
  id: string;
  label: string;
  icon: LucideIcon;
  run: (editor: Editor) => void;
  destructive?: boolean;
  /** Lives under More (alignment, deleting) so the strip stays short. */
  more?: boolean;
}

const TABLE_TOOLS: TableSpec[] = [
  { id: "row-above", label: "Add row above", icon: ArrowUpToLine, run: (e) => e.chain().focus().addRowBefore().run() },
  { id: "row-below", label: "Add row below", icon: ArrowDownToLine, run: (e) => e.chain().focus().addRowAfter().run() },
  { id: "col-left", label: "Add column left", icon: ArrowLeftToLine, run: (e) => e.chain().focus().addColumnBefore().run() },
  { id: "col-right", label: "Add column right", icon: ArrowRightToLine, run: (e) => e.chain().focus().addColumnAfter().run() },
  { id: "align-left", more: true, label: "Align column left", icon: AlignLeft, run: (e) => setColumnAlign(e, "left") },
  { id: "align-center", more: true, label: "Center column", icon: AlignCenter, run: (e) => setColumnAlign(e, "center") },
  { id: "align-right", more: true, label: "Align column right", icon: AlignRight, run: (e) => setColumnAlign(e, "right") },
  { id: "del-row", label: "Delete row", icon: Rows3, run: (e) => e.chain().focus().deleteRow().run(), destructive: true, more: true },
  { id: "del-col", label: "Delete column", icon: Columns3, run: (e) => e.chain().focus().deleteColumn().run(), destructive: true, more: true },
  { id: "del-table", label: "Delete table (Undo brings it back)", icon: Trash2, run: (e) => e.chain().focus().deleteTable().run(), destructive: true, more: true },
];

const TABLE_ACTIONS: Action[] = TABLE_TOOLS.map((spec, index) => {
  const id = `selection:table-${spec.id}`;
  return {
    id,
    label: spec.label,
    icon: registerAlchemyIcon(spec.icon),
    category: "edit",
    order: 100 + index,
    placement: spec.more ? "overflow" : "primary",
    preserveSelection: true,
    ...(spec.destructive ? { destructive: true } : {}),
    eligible: (t) => {
      const host = editorOf(t);
      if (!host || !shownInSelectionMode(id, t) || !host.editor.isEditable || !host.inTable()) return { status: "absent" };
      return { status: "available" };
    },
    run: (t) => {
      const host = editorOf(t);
      if (host) spec.run(host.editor);
    },
  };
});

/** The formatting provider (declared on load; the toolbar root registers it). */
export const richEditorFormatProvider: ActionProvider = {
  id: "rich-editor-format",
  tier: "T0",
  declaredIds: () => [VARIABLE_ACTION, ...TABLE_ACTIONS].map((a) => a.id),
  actions: (target) => (editorOf(target) ? placeSelectionActions([VARIABLE_ACTION, ...TABLE_ACTIONS], target) : []),
};

declareSelectionProvider(richEditorFormatProvider);
