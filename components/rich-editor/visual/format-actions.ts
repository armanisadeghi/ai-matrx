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
import { Bold, Braces, Code, Heading1, Heading2, Italic, Link2, List, Quote, Strikethrough, type LucideIcon } from "lucide-react";
import type { Action, ActionProvider, ClickTarget } from "@ai-matrx/alchemy/actions";
import { registerAlchemyIcon } from "@/components/agent-copy/alchemy-icon-keys";
import { declareSelectionProvider, hostHalf, shownInSelectionMode } from "@/components/selection-toolbar/selection-actions";
import { insertVariable } from "../core/commands";
import { toVariableName } from "../core/variables";

export const RICH_EDITOR_HOST_KEY = "richEditor";

export interface RichEditorSelectionHost {
  kind: "rich-editor";
  editor: Editor;
  onEditLink: () => void;
  offerVariables: boolean;
}

function editorOf(target: ClickTarget): RichEditorSelectionHost | null {
  const half = hostHalf<RichEditorSelectionHost>(target, RICH_EDITOR_HOST_KEY);
  return half?.kind === "rich-editor" && !half.editor.isDestroyed ? half : null;
}

/** A text range the editor can format (not a node selection, not blank). */
function formattable(editor: Editor): boolean {
  const { selection, doc } = editor.state;
  if (!editor.isEditable || selection.empty || selection instanceof NodeSelection) return false;
  return doc.textBetween(selection.from, selection.to).trim().length > 0;
}

interface FormatSpec {
  id: string;
  label: string;
  icon: LucideIcon;
  active?: (editor: Editor) => boolean;
  run: (host: RichEditorSelectionHost) => void;
  only?: (host: RichEditorSelectionHost) => boolean;
}

const FORMATS: FormatSpec[] = [
  { id: "bold", label: "Bold (⌘B)", icon: Bold, active: (e) => e.isActive("bold"), run: ({ editor }) => editor.chain().focus().toggleBold().run() },
  { id: "italic", label: "Italic (⌘I)", icon: Italic, active: (e) => e.isActive("italic"), run: ({ editor }) => editor.chain().focus().toggleItalic().run() },
  { id: "strike", label: "Strikethrough (⌘⇧S)", icon: Strikethrough, active: (e) => e.isActive("strike"), run: ({ editor }) => editor.chain().focus().toggleStrike().run() },
  { id: "code", label: "Inline code (⌘E)", icon: Code, active: (e) => e.isActive("code"), run: ({ editor }) => editor.chain().focus().toggleCode().run() },
  { id: "link", label: "Link (⌘K)", icon: Link2, active: (e) => e.isActive("link"), run: (h) => h.onEditLink() },
  { id: "h1", label: "Heading 1", icon: Heading1, active: (e) => e.isActive("heading", { level: 1 }), run: ({ editor }) => editor.chain().focus().toggleHeading({ level: 1 }).run() },
  { id: "h2", label: "Heading 2", icon: Heading2, active: (e) => e.isActive("heading", { level: 2 }), run: ({ editor }) => editor.chain().focus().toggleHeading({ level: 2 }).run() },
  { id: "quote", label: "Quote", icon: Quote, active: (e) => e.isActive("blockquote"), run: ({ editor }) => editor.chain().focus().toggleBlockquote().run() },
  { id: "list", label: "Bulleted list", icon: List, active: (e) => e.isActive("bulletList"), run: ({ editor }) => editor.chain().focus().toggleBulletList().run() },
  {
    id: "variable",
    label: "Turn into a {{variable}}",
    icon: Braces,
    only: (h) => h.offerVariables,
    run: ({ editor }) => {
      const { from, to } = editor.state.selection;
      const name = toVariableName(editor.state.doc.textBetween(from, to, " "));
      if (name) insertVariable(editor, name);
    },
  },
];

const ACTIONS: Action[] = FORMATS.map((spec, index) => {
  const id = `selection:format-${spec.id}`;
  return {
    id,
    label: spec.label,
    icon: registerAlchemyIcon(spec.icon),
    category: "edit",
    order: index,
    placement: "primary",
    preserveSelection: true,
    eligible: (t) => {
      const host = editorOf(t);
      if (!host || !shownInSelectionMode(id, t) || !formattable(host.editor)) return { status: "absent" };
      if (spec.only && !spec.only(host)) return { status: "absent" };
      return { status: "available" };
    },
    ...(spec.active
      ? {
          pressed: (t: ClickTarget) => {
            const host = editorOf(t);
            return host ? spec.active!(host.editor) : false;
          },
        }
      : {}),
    // The pressed state follows the editor (a toggle, a caret move).
    subscribe: (onChange: () => void, t: ClickTarget) => {
      const host = editorOf(t);
      if (!host) return () => undefined;
      host.editor.on("transaction", onChange);
      return () => {
        host.editor.off("transaction", onChange);
      };
    },
    run: (t) => {
      const host = editorOf(t);
      if (host) spec.run(host);
    },
  };
});

/** The formatting provider (declared on load; the toolbar root registers it). */
export const richEditorFormatProvider: ActionProvider = {
  id: "rich-editor-format",
  tier: "T0",
  declaredIds: () => ACTIONS.map((a) => a.id),
  actions: (target) => (editorOf(target) ? ACTIONS : []),
};

declareSelectionProvider(richEditorFormatProvider);
