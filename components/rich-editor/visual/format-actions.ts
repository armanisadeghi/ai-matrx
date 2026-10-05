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
  Bold,
  Braces,
  Code,
  Columns3,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  SquareCode,
  Rows3,
  Strikethrough,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { Action, ActionProvider, ClickTarget } from "@ai-matrx/alchemy/actions";
import { registerAlchemyIcon } from "@/components/agent-copy/alchemy-icon-keys";
import { declareSelectionProvider, hostHalf, placeSelectionActions, shownInSelectionMode } from "@/components/selection-toolbar/selection-actions";
import { insertCodeBlock, insertVariable, setColumnAlign, toggleTaskList } from "../core/commands";
import type { FormatCommandId } from "../core/markdown-format";
import { MARKDOWN_FORMAT_HOST_KEY, type FormatTarget, type MarkdownFormatHost } from "../format/format-target";
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

/**
 * THE active editor as a FormatTarget, whatever its engine: the visual
 * editor's half (Tiptap) or any markdown-text engine's half (the Source view's
 * CodeMirror, a notes Plain/Split textarea, every long-form ProTextarea).
 */
function formatTargetOf(target: ClickTarget): FormatTarget | null {
  const visual = editorOf(target);
  if (visual) {
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
  const text = hostHalf<MarkdownFormatHost>(target, MARKDOWN_FORMAT_HOST_KEY);
  return text?.kind === "markdown-format" ? text.target : null;
}

interface FormatSpec {
  /** The action id suffix (`selection:format-<id>`), stable since 2026-09-26. */
  id: string;
  command: FormatCommandId;
  label: string;
  icon: LucideIcon;
  /** Lives under More so the strip stays short. */
  more?: boolean;
}

/** One list, every engine. Labels carry the chord the keyboard runs. */
const FORMATS: FormatSpec[] = [
  { id: "bold", command: "bold", label: "Bold (⌘B)", icon: Bold },
  { id: "italic", command: "italic", label: "Italic (⌘I)", icon: Italic },
  { id: "strike", command: "strike", label: "Strikethrough (⌘⇧X)", icon: Strikethrough },
  { id: "code", command: "code", label: "Inline code (⌘E)", icon: Code },
  { id: "link", command: "link", label: "Link (⌘K)", icon: Link2 },
  { id: "h1", command: "heading1", label: "Heading 1", icon: Heading1 },
  { id: "h2", command: "heading2", label: "Heading 2", icon: Heading2 },
  { id: "h3", command: "heading3", label: "Heading 3", icon: Heading3, more: true },
  { id: "quote", command: "quote", label: "Quote", icon: Quote },
  { id: "list", command: "bulletList", label: "Bulleted list (⌘⇧8)", icon: List },
  { id: "numbered", command: "orderedList", label: "Numbered list (⌘⇧7)", icon: ListOrdered, more: true },
  { id: "tasks", command: "taskList", label: "Checklist (⌘⇧9)", icon: ListChecks, more: true },
  { id: "codeblock", command: "codeBlock", label: "Code block", icon: SquareCode, more: true },
];

const ACTIONS: Action[] = FORMATS.map((spec, index) => {
  const id = `selection:format-${spec.id}`;
  return {
    id,
    label: spec.label,
    icon: registerAlchemyIcon(spec.icon),
    category: "edit",
    order: index,
    placement: spec.more ? "overflow" : "primary",
    preserveSelection: true,
    eligible: (t) => {
      const fmt = formatTargetOf(t);
      if (!fmt || !shownInSelectionMode(id, t) || !fmt.canFormat()) return { status: "absent" };
      return { status: "available" };
    },
    pressed: (t: ClickTarget) => formatTargetOf(t)?.isActive(spec.command) ?? false,
    // The pressed state follows the editor (a toggle, a caret move).
    subscribe: (onChange: () => void, t: ClickTarget) => formatTargetOf(t)?.subscribe?.(onChange) ?? (() => undefined),
    run: (t) => {
      formatTargetOf(t)?.run(spec.command);
    },
  };
});

/** "Turn into a {{variable}}" — prompt surfaces in the visual editor only. */
const VARIABLE_ACTION: Action = {
  id: "selection:format-variable",
  label: "Turn into a {{variable}}",
  icon: registerAlchemyIcon(Braces),
  category: "edit",
  order: FORMATS.length,
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
  declaredIds: () => [...ACTIONS, VARIABLE_ACTION, ...TABLE_ACTIONS].map((a) => a.id),
  actions: (target) => (formatTargetOf(target) ? placeSelectionActions([...ACTIONS, VARIABLE_ACTION, ...TABLE_ACTIONS], target) : []),
};

declareSelectionProvider(richEditorFormatProvider);
