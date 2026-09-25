// components/rich-editor/visual/shortcut-handlers.ts
//
// What each entry of THE shortcut table (core/shortcuts.ts) does in the
// visual view. React-free, so a test proves no shortcut is left unbound.

import type { Editor } from "@tiptap/core";
import { insertCodeBlock, insertInlineMath, moveBlock, toggleTaskList } from "../core/commands";
import type { DeclaredVariable } from "../core/variables";
import { markAutoEdit } from "./auto-edit";

/** What the keymap and menus reach outside the document for. */
export interface RichShellActions {
  save: () => void;
  find: () => void;
  replace: () => void;
  toggleOutline: () => void;
  toggleFocus: () => void;
  /** Leave focus mode; false when it was not on (so Escape stays free for others). */
  exitFocus: () => boolean;
  cycleView: () => void;
  showHelp: () => void;
  showWordCount: () => void;
  editLink: () => void;
  pickKind: () => Promise<string | null>;
  pickImage: () => void;
  uploadImage: (file: File) => Promise<string | null>;
  variables: () => readonly DeclaredVariable[] | null;
  declareVariable: (name: string) => void;
  /** Approve a deliberate change to an island whose stored bytes are `raw`. */
  approveIsland: (raw: string) => void;
}

type Handler = (editor: Editor, shell: RichShellActions) => boolean;

/** Every shortcut id in the table → what it does. Exported so a test proves none is unbound. */
export const SHORTCUT_HANDLERS: Record<string, Handler> = {
  bold: (e) => e.chain().focus().toggleBold().run(),
  italic: (e) => e.chain().focus().toggleItalic().run(),
  strike: (e) => e.chain().focus().toggleStrike().run(),
  code: (e) => e.chain().focus().toggleCode().run(),
  link: (_e, shell) => (shell.editLink(), true),
  paragraph: (e) => e.chain().focus().setParagraph().run(),
  heading1: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
  heading2: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  heading3: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  heading4: (e) => e.chain().focus().toggleHeading({ level: 4 }).run(),
  heading5: (e) => e.chain().focus().toggleHeading({ level: 5 }).run(),
  heading6: (e) => e.chain().focus().toggleHeading({ level: 6 }).run(),
  orderedList: (e) => e.chain().focus().toggleOrderedList().run(),
  bulletList: (e) => e.chain().focus().toggleBulletList().run(),
  taskList: (e) => toggleTaskList(e),
  moveUp: (e) => moveBlock(e, "up"),
  moveDown: (e) => moveBlock(e, "down"),
  codeBlock: (e) => {
    markAutoEdit(e, insertCodeBlock(e));
    return true;
  },
  inlineMath: (e) => {
    const { from, to } = e.state.selection;
    return insertInlineMath(e, from === to ? "x" : e.state.doc.textBetween(from, to));
  },
  undo: (e) => e.commands.undo(),
  redo: (e) => e.commands.redo(),
  find: (_e, shell) => (shell.find(), true),
  replace: (_e, shell) => (shell.replace(), true),
  save: (_e, shell) => (shell.save(), true),
  wordCount: (_e, shell) => (shell.showWordCount(), true),
  outline: (_e, shell) => (shell.toggleOutline(), true),
  focus: (_e, shell) => (shell.toggleFocus(), true),
  cycleView: (_e, shell) => (shell.cycleView(), true),
  help: (_e, shell) => (shell.showHelp(), true),
};

