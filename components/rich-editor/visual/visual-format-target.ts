// components/rich-editor/visual/visual-format-target.ts
//
// The VISUAL engine of the one formatting command layer (format/format-target.ts):
// Tiptap marks and nodes for the same command ids the text engines run.

import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import type { FormatCommandId } from "../core/markdown-format";
import type { FormatTarget } from "../format/format-target";

// ── visual (Tiptap) ─────────────────────────────────────────────────────────

const VISUAL: Record<FormatCommandId, { run: (e: Editor) => boolean; active: (e: Editor) => boolean }> = {
  bold: { run: (e) => e.chain().focus().toggleBold().run(), active: (e) => e.isActive("bold") },
  italic: { run: (e) => e.chain().focus().toggleItalic().run(), active: (e) => e.isActive("italic") },
  strike: { run: (e) => e.chain().focus().toggleStrike().run(), active: (e) => e.isActive("strike") },
  code: { run: (e) => e.chain().focus().toggleCode().run(), active: (e) => e.isActive("code") },
  // Link opens the editor's own link field — the host passes it in.
  link: { run: () => false, active: (e) => e.isActive("link") },
  heading1: { run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(), active: (e) => e.isActive("heading", { level: 1 }) },
  heading2: { run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), active: (e) => e.isActive("heading", { level: 2 }) },
  heading3: { run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(), active: (e) => e.isActive("heading", { level: 3 }) },
  bulletList: { run: (e) => e.chain().focus().toggleBulletList().run(), active: (e) => e.isActive("bulletList") },
  orderedList: { run: (e) => e.chain().focus().toggleOrderedList().run(), active: (e) => e.isActive("orderedList") },
  taskList: { run: () => false, active: (e) => e.isActive("taskList") },
  quote: { run: (e) => e.chain().focus().toggleBlockquote().run(), active: (e) => e.isActive("blockquote") },
  codeBlock: { run: () => false, active: () => false },
};

/**
 * The visual engine. `overrides` carries the verbs the editor implements in
 * its own shell (link field, checklist, code-block island) — the same handlers
 * its keyboard shortcuts run, so a button and a chord can never differ.
 */
export function visualFormatTarget(
  editor: Editor,
  overrides: Partial<Record<FormatCommandId, () => boolean>> = {},
): FormatTarget {
  return {
    engine: "visual",
    run: (command) => {
      if (editor.isDestroyed || !editor.isEditable) return false;
      const own = overrides[command];
      return own ? own() : VISUAL[command].run(editor);
    },
    isActive: (command) => !editor.isDestroyed && VISUAL[command].active(editor),
    canFormat: () => {
      if (editor.isDestroyed || !editor.isEditable) return false;
      const { selection, doc } = editor.state;
      if (selection.empty || selection instanceof NodeSelection) return false;
      return doc.textBetween(selection.from, selection.to).trim().length > 0;
    },
    subscribe: (onChange) => {
      editor.on("transaction", onChange);
      return () => {
        editor.off("transaction", onChange);
      };
    },
  };
}

